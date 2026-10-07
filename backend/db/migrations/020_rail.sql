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
