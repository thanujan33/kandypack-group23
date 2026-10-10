ALTER TABLE orders MODIFY COLUMN status ENUM(
  'PENDING',
  'ALLOCATED',
  'ON_TRAIN',
  'PARTIAL_AT_STORE',
  'MISSING',
  'AT_STORE',
  'SCHEDULED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED'
) NOT NULL DEFAULT 'PENDING';

DELIMITER $$
CREATE PROCEDURE sp_cancel_order(
  IN p_order INT,
  IN p_user INT,
  IN p_role VARCHAR(20)
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_status VARCHAR(30);
  DECLARE v_customer INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id INTO v_lock FROM app_lock WHERE id = 1 FOR UPDATE;

  SELECT status, customer_id INTO v_status, v_customer
  FROM orders WHERE id = p_order FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found';
  END IF;

  IF p_role <> 'ADMIN' AND v_customer <> p_user THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only cancel your own orders';
  END IF;

  IF v_status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only PENDING orders can be cancelled';
  END IF;

  UPDATE orders SET status = 'CANCELLED' WHERE id = p_order;

  COMMIT;

  SELECT p_order AS id, 'Order successfully cancelled' AS message;
END$$
DELIMITER ;
