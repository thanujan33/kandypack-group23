CREATE VIEW v_sales_lines AS
SELECT o.id order_id,o.customer_id,o.placed_at,o.status,o.delivery_date,o.delivered_at,
  r.id route_id,r.name route,s.city,p.id product_id,p.name product,
  i.quantity,i.line_total,i.quantity*i.space_rate space_units
FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
JOIN routes r ON r.id=o.route_id JOIN stores s ON s.id=r.store_id;
CREATE VIEW v_staff_windows AS
SELECT id trip_id,driver_id employee_id,starts,finishes,status FROM v_trip_windows
UNION ALL
SELECT id trip_id,assistant_id employee_id,starts,finishes,status FROM v_trip_windows;
