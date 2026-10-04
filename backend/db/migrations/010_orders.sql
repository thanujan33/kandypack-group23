CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  unit_price DECIMAL(12,2) NOT NULL,
  space_rate DECIMAL(10,3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (unit_price > 0), CHECK (space_rate > 0)
) ENGINE=InnoDB;
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  route_id INT NOT NULL,
  placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_date DATE NOT NULL,
  address VARCHAR(255) NOT NULL,
  instructions VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('PENDING','ALLOCATED','ON_TRAIN','PARTIAL_AT_STORE','MISSING',
    'AT_STORE','SCHEDULED','OUT_FOR_DELIVERY','DELIVERED') NOT NULL DEFAULT 'PENDING',
  delivered_at DATETIME NULL,
  FOREIGN KEY(customer_id) REFERENCES users(id),
  FOREIGN KEY(route_id) REFERENCES routes(id),
  INDEX ix_orders_customer_date(customer_id,placed_at),
  INDEX ix_orders_date(placed_at),
  INDEX ix_orders_status_route(status,route_id)
) ENGINE=InnoDB;
CREATE TABLE order_items (
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  space_rate DECIMAL(10,3) NOT NULL,
  line_total DECIMAL(16,2) GENERATED ALWAYS AS (quantity*unit_price) STORED,
  PRIMARY KEY(order_id,product_id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  CHECK(quantity BETWEEN 1 AND 100000),
  CHECK(unit_price>0), CHECK(space_rate>0)
) ENGINE=InnoDB;
CREATE VIEW v_order_totals AS
SELECT order_id,SUM(line_total) total_value,SUM(quantity) total_quantity,
  SUM(quantity*space_rate) total_space FROM order_items GROUP BY order_id;

DELIMITER $$
CREATE TRIGGER orders_lead_insert BEFORE INSERT ON orders FOR EACH ROW
BEGIN
  IF NEW.delivery_date < DATE(NEW.placed_at)+INTERVAL 7 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Orders require at least 7 days notice';
  END IF;
END$$
CREATE TRIGGER orders_lead_update BEFORE UPDATE ON orders FOR EACH ROW
BEGIN
  IF NEW.delivery_date < DATE(NEW.placed_at)+INTERVAL 7 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Orders require at least 7 days notice';
  END IF;
END$$
CREATE PROCEDURE sp_place_order(
  IN p_customer INT, IN p_route INT, IN p_address VARCHAR(255),
  IN p_instructions VARCHAR(500), IN p_date DATE, IN p_items JSON
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_order INT;
  DECLARE v_lock INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_customer AND role='CUSTOMER' AND active=1)
     OR NOT EXISTS(SELECT 1 FROM routes WHERE id=p_route AND active=1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid customer or delivery route';
  END IF;
  IF p_date IS NULL OR p_date<CURRENT_DATE+INTERVAL 7 DAY OR
     p_address IS NULL OR CHAR_LENGTH(TRIM(p_address))=0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Address and delivery date at least 7 days away are required';
  END IF;
  IF JSON_TYPE(p_items)<>'ARRAY' OR JSON_LENGTH(p_items) NOT BETWEEN 1 AND 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An order needs 1 to 100 product lines';
  END IF;
  IF EXISTS (
    SELECT 1 FROM JSON_TABLE(p_items,'$[*]' COLUMNS(
      product_id DECIMAL(15,3) PATH '$.product_id', quantity DECIMAL(15,3) PATH '$.quantity')) j
    LEFT JOIN products p ON p.id=j.product_id AND p.active=1
    WHERE p.id IS NULL OR j.product_id<>FLOOR(j.product_id) OR j.quantity IS NULL
       OR j.quantity<>FLOOR(j.quantity) OR j.quantity NOT BETWEEN 1 AND 100000
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Use active products and positive whole quantities';
  END IF;
  IF EXISTS (SELECT product_id FROM JSON_TABLE(p_items,'$[*]' COLUMNS(
    product_id INT PATH '$.product_id')) j GROUP BY product_id HAVING COUNT(*)>1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Combine duplicate products into one line';
  END IF;
  INSERT INTO orders(customer_id,route_id,delivery_date,address,instructions)
    VALUES(p_customer,p_route,p_date,TRIM(p_address),COALESCE(p_instructions,''));
  SET v_order=LAST_INSERT_ID();
  INSERT INTO order_items(order_id,product_id,quantity,unit_price,space_rate)
    SELECT v_order,p.id,j.quantity,p.unit_price,p.space_rate
    FROM JSON_TABLE(p_items,'$[*]' COLUMNS(product_id INT PATH '$.product_id',
      quantity INT PATH '$.quantity')) j JOIN products p ON p.id=j.product_id;
  COMMIT;
  SELECT v_order id,'Order placed' message;
END$$
DELIMITER ;
