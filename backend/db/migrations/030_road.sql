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