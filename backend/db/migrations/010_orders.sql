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
DELIMITER ;
