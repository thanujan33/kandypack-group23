-- Store managers may schedule fully received orders on or after their due date.
-- Keep the original due date for delivery history and reporting.
-- The original administrator procedure and all other scheduling checks remain unchanged.
DELIMITER $$
CREATE PROCEDURE sp_schedule_store_delivery(
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
      OR o.delivery_date > DATE(p_start)
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
        'Orders must be unique, at store, on this route and due on or before the trip date';
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
DELIMITER ;
