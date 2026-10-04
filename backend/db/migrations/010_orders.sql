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
