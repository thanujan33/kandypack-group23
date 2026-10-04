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
CREATE PROCEDURE sp_allocate_order(IN p_order INT,IN p_first_trip INT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_store INT;
  DECLARE v_date DATE;
  DECLARE v_first DATETIME;
  DECLARE v_trip INT;
  DECLARE v_product INT;
  DECLARE v_remaining INT;
  DECLARE v_take INT;
  DECLARE v_rate DECIMAL(10,3);
  DECLARE v_capacity DECIMAL(16,3);
  DECLARE v_done INT DEFAULT 0;
  DECLARE trips CURSOR FOR SELECT id FROM train_trips
    WHERE store_id=v_store AND status='SCHEDULED' AND departure_at>=NOW()
      AND (departure_at>v_first OR (departure_at=v_first AND id>=p_first_trip))
      AND arrival_at<TIMESTAMP(v_date,'08:00:00') ORDER BY departure_at,id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE id=p_order AND status='PENDING') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only pending orders can be allocated';
  END IF;
  SELECT r.store_id,o.delivery_date INTO v_store,v_date FROM orders o
    JOIN routes r ON r.id=o.route_id WHERE o.id=p_order;
  IF NOT EXISTS(SELECT 1 FROM train_trips WHERE id=p_first_trip AND store_id=v_store
      AND status='SCHEDULED' AND departure_at>=NOW()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Choose an upcoming train for the correct store';
  END IF;
  SELECT departure_at INTO v_first FROM train_trips WHERE id=p_first_trip;
  OPEN trips;
  trip_loop: LOOP
    FETCH trips INTO v_trip;
    IF v_done=1 THEN LEAVE trip_loop; END IF;
    SELECT available_capacity INTO v_capacity FROM v_train_capacity WHERE id=v_trip;
    BEGIN
      DECLARE item_done INT DEFAULT 0;
      DECLARE items CURSOR FOR SELECT i.product_id,
        i.quantity-COALESCE((SELECT SUM(a.quantity) FROM train_allocations a
          WHERE a.order_id=i.order_id AND a.product_id=i.product_id),0),i.space_rate
        FROM order_items i WHERE i.order_id=p_order ORDER BY i.product_id;
      DECLARE CONTINUE HANDLER FOR NOT FOUND SET item_done=1;
      OPEN items;
      item_loop: LOOP
        FETCH items INTO v_product,v_remaining,v_rate;
        IF item_done=1 THEN LEAVE item_loop; END IF;
        SET v_take=LEAST(v_remaining,FLOOR(v_capacity/v_rate));
        IF v_take>0 THEN
          INSERT INTO train_allocations(train_trip_id,order_id,product_id,quantity,space_rate)
            VALUES(v_trip,p_order,v_product,v_take,v_rate);
          SET v_capacity=v_capacity-v_take*v_rate;
        END IF;
      END LOOP;
      CLOSE items;
    END;
  END LOOP;
  CLOSE trips;
  IF EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=p_order AND i.quantity>
    COALESCE((SELECT SUM(a.quantity) FROM train_allocations a
      WHERE a.order_id=i.order_id AND a.product_id=i.product_id),0)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Not enough eligible train capacity; add trips then retry. Nothing was allocated.';
  END IF;
  CALL sp_refresh_order(p_order);
  COMMIT;
  SELECT 'Order allocated across eligible trains' message;
END$$
CREATE PROCEDURE sp_dispatch_train(IN p_trip INT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_order INT;
  DECLARE v_done INT DEFAULT 0;
  DECLARE orders_cursor CURSOR FOR SELECT DISTINCT order_id FROM train_allocations WHERE train_trip_id=p_trip;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM train_trips WHERE id=p_trip AND status='SCHEDULED' AND departure_at<=NOW())
    OR NOT EXISTS(SELECT 1 FROM train_allocations WHERE train_trip_id=p_trip) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Train must be due, scheduled, and carrying allocations';
  END IF;
  UPDATE train_trips SET status='IN_TRANSIT' WHERE id=p_trip;
  OPEN orders_cursor;
  lp: LOOP
    FETCH orders_cursor INTO v_order;
    IF v_done=1 THEN LEAVE lp; END IF;
    CALL sp_refresh_order(v_order);
  END LOOP;
  CLOSE orders_cursor;
  COMMIT;
  SELECT 'Train dispatched' message;
END$$
CREATE PROCEDURE sp_receive_allocation(IN p_allocation INT,IN p_store INT,IN p_received INT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_lock INT;
  DECLARE v_order INT;
  DECLARE v_trip INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM train_allocations a JOIN train_trips t ON t.id=a.train_trip_id
    WHERE a.id=p_allocation AND t.store_id=p_store AND t.status<>'SCHEDULED'
      AND t.arrival_at<=NOW() AND p_received BETWEEN a.received_qty AND a.quantity) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Check store, train arrival time and cumulative received quantity';
  END IF;
  SELECT order_id,train_trip_id INTO v_order,v_trip FROM train_allocations WHERE id=p_allocation;
  UPDATE train_allocations SET received_qty=p_received,receipt_checked=1,received_at=NOW()
    WHERE id=p_allocation;
  IF NOT EXISTS(SELECT 1 FROM train_allocations WHERE train_trip_id=v_trip AND receipt_checked=0) THEN
    UPDATE train_trips SET status='ARRIVED' WHERE id=v_trip;
  END IF;
  CALL sp_refresh_order(v_order);
  COMMIT;
  SELECT 'Receipt recorded; unresolved quantities remain marked Missing' message;
END$$
DELIMITER ;
