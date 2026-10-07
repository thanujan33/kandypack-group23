CREATE TABLE train_trips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reference VARCHAR(80) NOT NULL UNIQUE,
  store_id INT NOT NULL,
  departure_at DATETIME NOT NULL,
  arrival_at DATETIME NOT NULL,
  capacity DECIMAL(12,3) NOT NULL,
  status ENUM('SCHEDULED','IN_TRANSIT','ARRIVED') NOT NULL DEFAULT 'SCHEDULED',
  FOREIGN KEY(store_id) REFERENCES stores(id),
  CHECK(capacity>0),CHECK(arrival_at>departure_at),
  INDEX ix_train_destination(store_id,departure_at)
) ENGINE=InnoDB;
CREATE TABLE train_allocations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  train_trip_id INT NOT NULL,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  space_rate DECIMAL(10,3) NOT NULL,
  space_used DECIMAL(16,3) GENERATED ALWAYS AS(quantity*space_rate) STORED,
  received_qty INT NOT NULL DEFAULT 0,
  receipt_checked BOOLEAN NOT NULL DEFAULT FALSE,
  received_at DATETIME NULL,
  UNIQUE(train_trip_id,order_id,product_id),
  FOREIGN KEY(train_trip_id) REFERENCES train_trips(id),
  FOREIGN KEY(order_id,product_id) REFERENCES order_items(order_id,product_id),
  CHECK(quantity>0),CHECK(received_qty BETWEEN 0 AND quantity),
  INDEX ix_allocation_order(order_id,product_id)
) ENGINE=InnoDB;
CREATE VIEW v_train_capacity AS
SELECT t.*,t.capacity-COALESCE(a.used,0) available_capacity
FROM train_trips t LEFT JOIN (SELECT train_trip_id,SUM(space_used) used
  FROM train_allocations GROUP BY train_trip_id) a ON a.train_trip_id=t.id;

DELIMITER $$
CREATE PROCEDURE sp_refresh_order(IN p_order INT)
BEGIN
  UPDATE orders SET status=CASE
    WHEN EXISTS(SELECT 1 FROM train_allocations WHERE order_id=p_order
      AND receipt_checked=1 AND received_qty<quantity) THEN 'MISSING'
    WHEN (SELECT COALESCE(SUM(received_qty),0) FROM train_allocations WHERE order_id=p_order)
      = (SELECT SUM(quantity) FROM order_items WHERE order_id=p_order) THEN 'AT_STORE'
    WHEN EXISTS(SELECT 1 FROM train_allocations WHERE order_id=p_order AND received_qty>0)
      THEN 'PARTIAL_AT_STORE'
    WHEN EXISTS(SELECT 1 FROM train_allocations a JOIN train_trips t ON t.id=a.train_trip_id
      WHERE a.order_id=p_order AND t.status<>'SCHEDULED') THEN 'ON_TRAIN'
    WHEN EXISTS(SELECT 1 FROM train_allocations WHERE order_id=p_order) THEN 'ALLOCATED'
    ELSE 'PENDING' END
  WHERE id=p_order AND status NOT IN('SCHEDULED','OUT_FOR_DELIVERY','DELIVERED');
END$$
CREATE TRIGGER allocation_guard BEFORE INSERT ON train_allocations FOR EACH ROW
BEGIN
  DECLARE v_remaining INT;
  DECLARE v_rate DECIMAL(10,3);
  DECLARE v_available DECIMAL(16,3);
  SELECT i.quantity-COALESCE((SELECT SUM(a.quantity) FROM train_allocations a
    WHERE a.order_id=NEW.order_id AND a.product_id=NEW.product_id),0),i.space_rate
    INTO v_remaining,v_rate FROM order_items i
    WHERE i.order_id=NEW.order_id AND i.product_id=NEW.product_id;
  SELECT available_capacity INTO v_available FROM v_train_capacity WHERE id=NEW.train_trip_id;
  IF v_remaining IS NULL OR NEW.quantity>v_remaining OR NEW.quantity*v_rate>v_available THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Train capacity or order quantity exceeded';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM train_trips t JOIN orders o ON o.id=NEW.order_id
    JOIN routes r ON r.id=o.route_id WHERE t.id=NEW.train_trip_id AND t.store_id=r.store_id
    AND t.status='SCHEDULED' AND t.departure_at>=o.placed_at
    AND t.arrival_at<TIMESTAMP(o.delivery_date,'08:00:00')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Train destination or timing is invalid';
  END IF;
  SET NEW.space_rate=v_rate;
END$$
CREATE TRIGGER allocation_immutable BEFORE UPDATE ON train_allocations FOR EACH ROW
BEGIN
  IF NEW.quantity<>OLD.quantity OR NEW.train_trip_id<>OLD.train_trip_id
    OR NEW.order_id<>OLD.order_id OR NEW.product_id<>OLD.product_id
    OR NEW.space_rate<>OLD.space_rate THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Allocation identity and quantities are immutable';
  END IF;
  IF NEW.received_qty<OLD.received_qty THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Received quantity cannot decrease';
  END IF;
END$$
CREATE TRIGGER train_edit_guard BEFORE UPDATE ON train_trips FOR EACH ROW
BEGIN
  IF EXISTS(SELECT 1 FROM train_allocations WHERE train_trip_id=OLD.id) AND
    (NEW.store_id<>OLD.store_id OR NEW.departure_at<>OLD.departure_at
      OR NEW.arrival_at<>OLD.arrival_at OR NEW.capacity<>OLD.capacity) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An allocated train timetable is locked';
  END IF;
END$$