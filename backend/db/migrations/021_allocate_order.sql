DELIMITER $$

CREATE PROCEDURE sp_allocate_order(
  IN p_order INT,
  IN p_first_trip INT
)
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

  DECLARE trips CURSOR FOR
    SELECT id
    FROM train_trips
    WHERE store_id=v_store
      AND status='SCHEDULED'
      AND departure_at>=NOW()
      AND (
        departure_at>v_first
        OR (departure_at=v_first AND id>=p_first_trip)
      )
      AND arrival_at<TIMESTAMP(v_date,'08:00:00')
    ORDER BY departure_at,id;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id
  INTO v_lock
  FROM app_lock
  WHERE id=1
  FOR UPDATE;

  IF NOT EXISTS(
    SELECT 1
    FROM orders
    WHERE id=p_order
      AND status='PENDING'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Only pending orders can be allocated';
  END IF;

  SELECT r.store_id,o.delivery_date
  INTO v_store,v_date
  FROM orders o
  JOIN routes r ON r.id=o.route_id
  WHERE o.id=p_order;

  IF NOT EXISTS(
    SELECT 1
    FROM train_trips
    WHERE id=p_first_trip
      AND store_id=v_store
      AND status='SCHEDULED'
      AND departure_at>=NOW()
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Choose an upcoming train for the correct store';
  END IF;

  SELECT departure_at
  INTO v_first
  FROM train_trips
  WHERE id=p_first_trip;

  OPEN trips;

  trip_loop: LOOP

    FETCH trips INTO v_trip;

    IF v_done=1 THEN
      LEAVE trip_loop;
    END IF;

    SELECT available_capacity
    INTO v_capacity
    FROM v_train_capacity
    WHERE id=v_trip;

    BEGIN
      DECLARE item_done INT DEFAULT 0;

      DECLARE items CURSOR FOR
        SELECT
          i.product_id,
          i.quantity-COALESCE(
            (
              SELECT SUM(a.quantity)
              FROM train_allocations a
              WHERE a.order_id=i.order_id
                AND a.product_id=i.product_id
            ),
            0
          ),
          i.space_rate
        FROM order_items i
        WHERE i.order_id=p_order
        ORDER BY i.product_id;

      DECLARE CONTINUE HANDLER FOR NOT FOUND
        SET item_done=1;

      OPEN items;

      item_loop: LOOP

        FETCH items
        INTO v_product,v_remaining,v_rate;

        IF item_done=1 THEN
          LEAVE item_loop;
        END IF;

        SET v_take=
          LEAST(
            v_remaining,
            FLOOR(v_capacity/v_rate)
          );

        IF v_take>0 THEN

          INSERT INTO train_allocations(
            train_trip_id,
            order_id,
            product_id,
            quantity,
            space_rate
          )
          VALUES(
            v_trip,
            p_order,
            v_product,
            v_take,
            v_rate
          );

          SET v_capacity=
            v_capacity-v_take*v_rate;

        END IF;

      END LOOP;

      CLOSE items;

    END;

  END LOOP;

  CLOSE trips;

  IF EXISTS(
    SELECT 1
    FROM order_items i
    WHERE i.order_id=p_order
      AND i.quantity >
        COALESCE(
          (
            SELECT SUM(a.quantity)
            FROM train_allocations a
            WHERE a.order_id=i.order_id
              AND a.product_id=i.product_id
          ),
          0
        )
  ) THEN

    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT=
        'Not enough eligible train capacity; add trips then retry. Nothing was allocated.';

  END IF;

  CALL sp_refresh_order(p_order);

  COMMIT;

  SELECT 'Order allocated across eligible trains' message;

END$$

DELIMITER ;