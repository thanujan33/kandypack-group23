CREATE TABLE trucks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_id INT NOT NULL,
  plate VARCHAR(30) NOT NULL UNIQUE,
  type VARCHAR(60) NOT NULL,
  capacity DECIMAL(12,3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(store_id) REFERENCES stores(id),
  CHECK(capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  store_id INT NOT NULL,
  role ENUM('DRIVER','ASSISTANT') NOT NULL,
  name VARCHAR(100) NOT NULL,
  nic VARCHAR(30) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(store_id) REFERENCES stores(id),
  INDEX ix_employee_store_role(store_id,role)
) ENGINE=InnoDB;

CREATE TABLE delivery_trips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  route_id INT NOT NULL,
  truck_id INT NOT NULL,
  driver_id INT NOT NULL,
  assistant_id INT NOT NULL,
  planned_start DATETIME NOT NULL,
  planned_end DATETIME NOT NULL,
  actual_start DATETIME NULL,
  actual_end DATETIME NULL,
  status ENUM('PLANNED','OUT','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED',

  FOREIGN KEY(route_id) REFERENCES routes(id),
  FOREIGN KEY(truck_id) REFERENCES trucks(id),
  FOREIGN KEY(driver_id) REFERENCES employees(id),
  FOREIGN KEY(assistant_id) REFERENCES employees(id),

  CHECK(driver_id <> assistant_id),
  CHECK(planned_end > planned_start),
  CHECK(
    actual_end IS NULL
    OR (actual_start IS NOT NULL AND actual_end > actual_start)
  ),

  INDEX ix_trip_truck(truck_id,planned_start),
  INDEX ix_trip_driver(driver_id,planned_start),
  INDEX ix_trip_assistant(assistant_id,planned_start)
) ENGINE=InnoDB;

CREATE TABLE delivery_trip_orders (
  trip_id INT NOT NULL,
  order_id INT NOT NULL,
  outcome ENUM('PENDING','DELIVERED','FAILED') NOT NULL DEFAULT 'PENDING',

  PRIMARY KEY(trip_id,order_id),

  FOREIGN KEY(trip_id) REFERENCES delivery_trips(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),

  INDEX ix_delivery_order(order_id)
) ENGINE=InnoDB;

CREATE VIEW v_trip_windows AS
SELECT
  d.*,
  COALESCE(actual_start,planned_start) starts,
  CASE
    WHEN actual_end IS NOT NULL THEN actual_end
    WHEN actual_start IS NOT NULL THEN GREATEST(
      NOW(),
      TIMESTAMPADD(
        MINUTE,
        TIMESTAMPDIFF(MINUTE,planned_start,planned_end),
        actual_start
      )
    )
    ELSE planned_end
  END finishes
FROM delivery_trips d
WHERE status <> 'CANCELLED';

DELIMITER $$

CREATE FUNCTION fn_work_minutes(
  p_employee INT,
  p_week DATE,
  p_exclude INT
)
RETURNS DECIMAL(14,4)
READS SQL DATA
BEGIN
  DECLARE v_minutes DECIMAL(14,4);

  SELECT COALESCE(
    SUM(
      TIMESTAMPDIFF(
        SECOND,
        GREATEST(starts,p_week),
        LEAST(finishes,p_week + INTERVAL 7 DAY)
      )
    ) / 60,
    0
  )
  INTO v_minutes
  FROM v_trip_windows
  WHERE (driver_id = p_employee OR assistant_id = p_employee)
    AND id <> p_exclude
    AND starts < p_week + INTERVAL 7 DAY
    AND finishes > p_week;

  RETURN v_minutes;
END$$

CREATE PROCEDURE sp_check_roster(
  IN p_exclude INT,
  IN p_route INT,
  IN p_truck INT,
  IN p_driver INT,
  IN p_assistant INT,
  IN p_start DATETIME,
  IN p_end DATETIME
)
BEGIN
  DECLARE v_store INT;
  DECLARE v_max INT;
  DECLARE v_week DATE;
  DECLARE v_part DECIMAL(14,4);
  DECLARE v_chain INT;

  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'End must be after start';
  END IF;

  SELECT store_id,max_minutes
  INTO v_store,v_max
  FROM routes
  WHERE id = p_route AND active = 1;

  IF v_store IS NULL
    OR TIMESTAMPDIFF(SECOND,p_start,p_end) > v_max * 60 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Route is inactive or exceeds maximum delivery time';
  END IF;

  IF NOT EXISTS(
      SELECT 1
      FROM trucks
      WHERE id = p_truck
        AND store_id = v_store
        AND active = 1
    )
    OR NOT EXISTS(
      SELECT 1
      FROM employees
      WHERE id = p_driver
        AND store_id = v_store
        AND role = 'DRIVER'
        AND active = 1
    )
    OR NOT EXISTS(
      SELECT 1
      FROM employees
      WHERE id = p_assistant
        AND store_id = v_store
        AND role = 'ASSISTANT'
        AND active = 1
    )
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Truck, driver and assistant must be active and belong to the route store';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM v_trip_windows
    WHERE id <> p_exclude
      AND (
        truck_id = p_truck
        OR driver_id = p_driver
        OR assistant_id = p_assistant
      )
      AND (
        status = 'OUT'
        OR (starts < p_end AND finishes > p_start)
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'A resource overlaps or is still out on another trip';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM v_trip_windows
    WHERE id <> p_exclude
      AND driver_id = p_driver
      AND (
        (finishes <= p_start
          AND finishes > p_start - INTERVAL 30 MINUTE)
        OR
        (starts >= p_end
          AND starts < p_end + INTERVAL 30 MINUTE)
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Driver needs a 30 minute break between deliveries';
  END IF;

  WITH intervals AS (
    SELECT id,starts,finishes
    FROM v_trip_windows
    WHERE assistant_id = p_assistant
      AND id <> p_exclude

    UNION ALL

    SELECT -1,p_start,p_end
  ),
  previous AS (
    SELECT *,
      LAG(finishes) OVER(ORDER BY starts,id) previous_end
    FROM intervals
  ),
  groupset AS (
    SELECT *,
      SUM(
        CASE
          WHEN previous_end IS NULL
            OR starts >= previous_end + INTERVAL 30 MINUTE
          THEN 1
          ELSE 0
        END
      ) OVER(ORDER BY starts,id) chain
    FROM previous
  )
  SELECT COUNT(*)
  INTO v_chain
  FROM groupset
  WHERE chain = (
    SELECT chain
    FROM groupset
    WHERE id = -1
  );

  IF v_chain > 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Assistant may do at most two consecutive routes before a 30 minute break';
  END IF;

  SET v_week =
    DATE_SUB(DATE(p_start),INTERVAL WEEKDAY(p_start) DAY);

  WHILE v_week < p_end DO
    SET v_part =
      TIMESTAMPDIFF(
        SECOND,
        GREATEST(p_start,v_week),
        LEAST(p_end,v_week + INTERVAL 7 DAY)
      ) / 60;

    IF fn_work_minutes(p_driver,v_week,p_exclude) + v_part > 2400
      OR fn_work_minutes(p_assistant,v_week,p_exclude) + v_part > 3600
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT =
          'Weekly limit exceeded: driver 40 hours or assistant 60 hours';
    END IF;

    SET v_week = v_week + INTERVAL 7 DAY;
  END WHILE;
END$$


CREATE TRIGGER road_insert_guard
BEFORE INSERT ON delivery_trips
FOR EACH ROW
BEGIN
  DECLARE v_lock INT;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id = 1
  FOR UPDATE;

  CALL sp_check_roster(
    0,
    NEW.route_id,
    NEW.truck_id,
    NEW.driver_id,
    NEW.assistant_id,
    NEW.planned_start,
    NEW.planned_end
  );
END$$


CREATE TRIGGER road_update_guard
BEFORE UPDATE ON delivery_trips
FOR EACH ROW
BEGIN
  IF NEW.route_id <> OLD.route_id
    OR NEW.truck_id <> OLD.truck_id
    OR NEW.driver_id <> OLD.driver_id
    OR NEW.assistant_id <> OLD.assistant_id
    OR NEW.planned_start <> OLD.planned_start
    OR NEW.planned_end <> OLD.planned_end
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Cancel and recreate a planned trip to change its schedule';
  END IF;

  IF OLD.status = 'PLANNED'
    AND NEW.status = 'OUT'
  THEN
    CALL sp_check_roster(
      OLD.id,
      NEW.route_id,
      NEW.truck_id,
      NEW.driver_id,
      NEW.assistant_id,
      NEW.actual_start,
      TIMESTAMPADD(
        MINUTE,
        TIMESTAMPDIFF(
          MINUTE,
          NEW.planned_start,
          NEW.planned_end
        ),
        NEW.actual_start
      )
    );
  END IF;
END$$


CREATE PROCEDURE sp_schedule_delivery(
  IN p_route INT,
  IN p_truck INT,
  IN p_driver INT,
  IN p_assistant INT,
  IN p_start DATETIME,
  IN p_end DATETIME,
  IN p_orders JSON
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_trip INT;
  DECLARE v_space DECIMAL(16,3);
  DECLARE v_capacity DECIMAL(12,3);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id = 1
  FOR UPDATE;

  IF p_start < NOW()
    OR JSON_TYPE(p_orders) <> 'ARRAY'
    OR JSON_LENGTH(p_orders) NOT BETWEEN 1 AND 100
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Choose a future start and 1 to 100 orders';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM JSON_TABLE(
      p_orders,
      '$[*]' COLUMNS(id INT PATH '$')
    ) j
    LEFT JOIN orders o ON o.id = j.id
    WHERE o.id IS NULL
      OR o.status <> 'AT_STORE'
      OR o.route_id <> p_route
      OR o.delivery_date <> DATE(p_start)
  )
  OR (
    SELECT COUNT(DISTINCT id)
    FROM JSON_TABLE(
      p_orders,
      '$[*]' COLUMNS(id INT PATH '$')
    ) j
  ) <> JSON_LENGTH(p_orders)
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Orders must be unique, at store, on this route and due on the selected day';
  END IF;

  SELECT SUM(t.total_space)
  INTO v_space
  FROM v_order_totals t
  JOIN JSON_TABLE(
    p_orders,
    '$[*]' COLUMNS(id INT PATH '$')
  ) j
    ON j.id = t.order_id;

  SELECT capacity
  INTO v_capacity
  FROM trucks
  WHERE id = p_truck;

  IF v_space > v_capacity THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Selected orders exceed truck capacity';
  END IF;

  INSERT INTO delivery_trips(
    route_id,
    truck_id,
    driver_id,
    assistant_id,
    planned_start,
    planned_end
  )
  VALUES(
    p_route,
    p_truck,
    p_driver,
    p_assistant,
    p_start,
    p_end
  );

  SET v_trip = LAST_INSERT_ID();

  INSERT INTO delivery_trip_orders(
    trip_id,
    order_id
  )
  SELECT v_trip,id
  FROM JSON_TABLE(
    p_orders,
    '$[*]' COLUMNS(id INT PATH '$')
  ) j;

  UPDATE orders o
  JOIN delivery_trip_orders x
    ON x.order_id = o.id
  SET o.status = 'SCHEDULED'
  WHERE x.trip_id = v_trip;

  COMMIT;

  SELECT
    v_trip id,
    'Delivery reserved; dispatch at the actual start time' message;
END$$


CREATE PROCEDURE sp_dispatch_delivery(
  IN p_trip INT
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id = 1
  FOR UPDATE;

  IF NOT EXISTS(
    SELECT 1
    FROM delivery_trips
    WHERE id = p_trip
      AND status = 'PLANNED'
      AND DATE(planned_start) = CURRENT_DATE
  )
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Trip must be planned for today';
  END IF;

  UPDATE delivery_trips
  SET
    status = 'OUT',
    actual_start = NOW()
  WHERE id = p_trip;

  UPDATE orders o
  JOIN delivery_trip_orders x
    ON x.order_id = o.id
  SET o.status = 'OUT_FOR_DELIVERY'
  WHERE x.trip_id = p_trip;

  COMMIT;

  SELECT 'Trip dispatched; actual start recorded' message;
END$$


CREATE PROCEDURE sp_cancel_delivery(
  IN p_trip INT
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id = 1
  FOR UPDATE;

  IF NOT EXISTS(
    SELECT 1
    FROM delivery_trips
    WHERE id = p_trip
      AND status = 'PLANNED'
  )
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only planned trips can be cancelled';
  END IF;

  UPDATE delivery_trips
  SET status = 'CANCELLED'
  WHERE id = p_trip;

  UPDATE delivery_trip_orders
  SET outcome = 'FAILED'
  WHERE trip_id = p_trip;

  UPDATE orders o
  JOIN delivery_trip_orders x
    ON x.order_id = o.id
  SET o.status = 'AT_STORE'
  WHERE x.trip_id = p_trip;

  COMMIT;

  SELECT 'Cancelled; orders and resources released' message;
END$$


CREATE PROCEDURE sp_return_delivery(
  IN p_trip INT,
  IN p_end DATETIME,
  IN p_delivered JSON
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id = 1
  FOR UPDATE;

  IF NOT EXISTS(
    SELECT 1
    FROM delivery_trips
    WHERE id = p_trip
      AND status = 'OUT'
      AND p_end > actual_start
      AND p_end <= NOW()
  )
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Choose an active trip and an actual return time after its start and not in the future';
  END IF;

  IF JSON_TYPE(p_delivered) <> 'ARRAY'
    OR EXISTS(
      SELECT 1
      FROM JSON_TABLE(
        p_delivered,
        '$[*]' COLUMNS(id INT PATH '$')
      ) j
      LEFT JOIN delivery_trip_orders x
        ON x.order_id = j.id
        AND x.trip_id = p_trip
      WHERE x.order_id IS NULL
    )
  THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Delivered IDs must belong to this trip';
  END IF;

  UPDATE delivery_trips
  SET
    status = 'COMPLETED',
    actual_end = p_end
  WHERE id = p_trip;

  UPDATE delivery_trip_orders x
  SET outcome = IF(
    EXISTS(
      SELECT 1
      FROM JSON_TABLE(
        p_delivered,
        '$[*]' COLUMNS(id INT PATH '$')
      ) j
      WHERE j.id = x.order_id
    ),
    'DELIVERED',
    'FAILED'
  )
  WHERE trip_id = p_trip;

  UPDATE orders o
  JOIN delivery_trip_orders x
    ON x.order_id = o.id
  SET
    o.status = IF(
      x.outcome = 'DELIVERED',
      'DELIVERED',
      'AT_STORE'
    ),
    o.delivered_at = IF(
      x.outcome = 'DELIVERED',
      p_end,
      NULL
    )
  WHERE x.trip_id = p_trip;

  COMMIT;

  SELECT
    'Return saved. Failed orders are back at store. Review actual hours and late-route warnings.' message;
END$$


DELIMITER ;
