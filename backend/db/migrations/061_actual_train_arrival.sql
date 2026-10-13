ALTER TABLE train_trips
ADD COLUMN actual_arrival_at DATETIME NULL
AFTER arrival_at;

ALTER TABLE train_trips
ADD CONSTRAINT chk_train_actual_arrival
CHECK (
  actual_arrival_at IS NULL
  OR actual_arrival_at >= departure_at
);

CREATE OR REPLACE VIEW v_train_capacity AS
SELECT
  t.*,
  t.capacity - COALESCE(a.used, 0) AS available_capacity
FROM train_trips t
LEFT JOIN (
  SELECT
    train_trip_id,
    SUM(space_used) AS used
  FROM train_allocations
  GROUP BY train_trip_id
) a
  ON a.train_trip_id = t.id;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_mark_train_arrived$$

CREATE PROCEDURE sp_mark_train_arrived(
  IN p_trip INT,
  IN p_store INT
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

  IF NOT EXISTS (
    SELECT 1
    FROM train_trips
    WHERE id = p_trip
      AND store_id = p_store
      AND status = 'IN_TRANSIT'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Only an in-transit train for this store can be marked as arrived';
  END IF;

  UPDATE train_trips
  SET
    status = 'ARRIVED',
    actual_arrival_at = NOW()
  WHERE id = p_trip;

  COMMIT;

  SELECT
    'Train arrival recorded' AS message;
END$$


DROP PROCEDURE IF EXISTS sp_receive_allocation$$

CREATE PROCEDURE sp_receive_allocation(
  IN p_allocation INT,
  IN p_store INT,
  IN p_received INT
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_order INT;
  DECLARE v_trip INT;

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

  IF NOT EXISTS (
    SELECT 1
    FROM train_allocations a
    JOIN train_trips t
      ON t.id = a.train_trip_id
    WHERE a.id = p_allocation
      AND t.store_id = p_store
      AND t.status = 'ARRIVED'
      AND p_received BETWEEN a.received_qty AND a.quantity
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT =
        'Train must have arrived at this store and received quantity must be valid';
  END IF;

  SELECT
    order_id,
    train_trip_id
  INTO
    v_order,
    v_trip
  FROM train_allocations
  WHERE id = p_allocation;

  UPDATE train_allocations
  SET
    received_qty = p_received,
    receipt_checked = 1,
    received_at = NOW()
  WHERE id = p_allocation;

  CALL sp_refresh_order(v_order);

  COMMIT;

  SELECT
    'Receipt recorded; unresolved quantities remain marked Missing' AS message;
END$$

DELIMITER ;