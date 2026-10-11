# KandyPack — Analytics & Reporting Query Reference

> **Semester 3 Database Systems · Group 23**  
> **Module:** Analytics & Reporting Subsystem (`D5`)  
> **Route File:** [`backend/src/modules/reports.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/reports.routes.js)  
> **Timezone Basis:** Asia/Colombo (`GMT+05:30`)

---

## 1. Overview of Reporting Subsystem

The KandyPack reporting subsystem translates operational transactional data across rail timetables, warehouse orders, and road delivery trips into high-level business intelligence. 

All analytics endpoints leverage database views (`v_sales_lines`, `v_trip_windows`, `v_staff_windows`, `v_order_totals`) and MySQL window/aggregation functions to eliminate application-side data processing bottlenecks.

---

## 2. Endpoint Specifications & Query Reference

### 2.1 Quarterly Sales Revenue (`/api/reports/quarterly`)
* **HTTP Method & Path:** `GET /api/reports/quarterly`
* **Access Control:** `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `year`: Integer calendar year (`2000` to `2100`)
  - `quarter`: Integer calendar quarter (`1` to `4`)
* **Plain-English Description:**  
  Aggregates total customer orders, revenue in LKR, total cartons, and total cubic volume displaced by order placement date, grouped by calendar month.
* **Underlying SQL Query:**
  ```sql
  SELECT 
    DATE_FORMAT(placed_at, '%Y-%m') AS month,
    COUNT(DISTINCT order_id) AS orders,
    SUM(line_total) AS sales_LKR,
    SUM(quantity) AS units,
    SUM(space_units) AS space_units
  FROM v_sales_lines 
  WHERE placed_at >= ? AND placed_at < ?
  GROUP BY DATE_FORMAT(placed_at, '%Y-%m') 
  ORDER BY month;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "month": "2026-07",
      "orders": 12,
      "sales_LKR": "485000.00",
      "units": 1420,
      "space_units": "28.400"
    },
    {
      "month": "2026-08",
      "orders": 16,
      "sales_LKR": "620000.00",
      "units": 1850,
      "space_units": "37.000"
    },
    {
      "month": "2026-09",
      "orders": 12,
      "sales_LKR": "510000.00",
      "units": 1500,
      "space_units": "30.000"
    }
  ]
  ```

---

### 2.2 Most Ordered Products (`/api/reports/products`)
* **HTTP Method & Path:** `GET /api/reports/products`
* **Access Control:** `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `year`: Integer calendar year (`2000` to `2100`)
  - `quarter`: Integer calendar quarter (`1` to `4`)
* **Plain-English Description:**  
  Ranks product SKUs by total physical units sold and order frequency during the specified quarter, providing product demand intelligence to factory production managers.
* **Underlying SQL Query:**
  ```sql
  SELECT 
    product_id,
    product,
    SUM(quantity) AS units,
    COUNT(DISTINCT order_id) AS order_count,
    SUM(line_total) AS sales_LKR 
  FROM v_sales_lines 
  WHERE placed_at >= ? AND placed_at < ?
  GROUP BY product_id, product 
  ORDER BY units DESC, product_id;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "product_id": 1,
      "product": "Kandy Royal Toffee (500g)",
      "units": 820,
      "order_count": 22,
      "sales_LKR": "369000.00"
    },
    {
      "product_id": 4,
      "product": "Ceylon Cinnamon Drops (250g)",
      "units": 640,
      "order_count": 18,
      "sales_LKR": "224000.00"
    },
    {
      "product_id": 2,
      "product": "Hill Country Chocolate Bites",
      "units": 510,
      "order_count": 15,
      "sales_LKR": "306000.00"
    }
  ]
  ```

---

### 2.3 Regional Destination & Route Sales (`/api/reports/locations`)
* **HTTP Method & Path:** `GET /api/reports/locations`
* **Access Control:** `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `year`: Integer calendar year (`2000` to `2100`)
  - `quarter`: Integer calendar quarter (`1` to `4`)
* **Plain-English Description:**  
  Generates a multi-tier geographic revenue breakdown: high-level aggregated totals by destination city, followed by individual local route totals.
* **Underlying SQL Query:**
  ```sql
  SELECT 
    'CITY' AS level,
    city,
    NULL AS route_id,
    NULL AS route,
    SUM(line_total) AS sales_LKR,
    SUM(quantity) AS units 
  FROM v_sales_lines
  WHERE placed_at >= ? AND placed_at < ? 
  GROUP BY city

  UNION ALL 

  SELECT 
    'ROUTE' AS level,
    city,
    route_id,
    route,
    SUM(line_total) AS sales_LKR,
    SUM(quantity) AS units
  FROM v_sales_lines 
  WHERE placed_at >= ? AND placed_at < ? 
  GROUP BY city, route_id, route;
  ```
* **Sample JSON Response:**
  ```json
  [
    { "level": "CITY", "city": "Colombo", "route_id": null, "route": null, "sales_LKR": "840000.00", "units": 2400 },
    { "level": "CITY", "city": "Galle", "route_id": null, "route": null, "sales_LKR": "410000.00", "units": 1150 },
    { "level": "ROUTE", "city": "Colombo", "route_id": 1, "route": "Colombo Central A", "sales_LKR": "490000.00", "units": 1400 },
    { "level": "ROUTE", "city": "Colombo", "route_id": 2, "route": "Colombo South Coastal", "sales_LKR": "350000.00", "units": 1000 }
  ]
  ```

---

### 2.4 Staff Weekly Work Hours & Labor Compliance (`/api/reports/hours`)
* **HTTP Method & Path:** `GET /api/reports/hours`
* **Access Control:** `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `week`: Date string in `YYYY-MM-DD` format (any day falling within the desired Monday-Sunday week)
* **Plain-English Description:**  
  Audits road delivery staff against Sri Lankan transport labor laws: calculates actual hours on completed trips, reserved hours on upcoming trips, compares against legal caps (40h/week for Drivers, 60h/week for Assistants), and flags excess hours. Handles trips spanning midnight and Sunday-Monday boundaries.
* **Underlying SQL Query:**
  ```sql
  WITH bounds AS (
    SELECT DATE_SUB(DATE(?), INTERVAL WEEKDAY(?) DAY) AS a
  ),
  segments AS (
    SELECT 
      w.employee_id,
      w.status,
      TIMESTAMPDIFF(MINUTE, GREATEST(w.starts, b.a), LEAST(w.finishes, b.a + INTERVAL 7 DAY)) / 60.0 AS hours
    FROM v_staff_windows w 
    CROSS JOIN bounds b 
    WHERE w.starts < b.a + INTERVAL 7 DAY AND w.finishes > b.a
  )
  SELECT 
    e.id,
    e.name,
    e.role,
    s.city,
    COALESCE(SUM(IF(x.status = 'COMPLETED', x.hours, 0)), 0) AS actual_hours,
    COALESCE(SUM(IF(x.status <> 'COMPLETED', x.hours, 0)), 0) AS reserved_hours,
    IF(e.role = 'DRIVER', 40, 60) AS weekly_limit,
    GREATEST(0, COALESCE(SUM(x.hours), 0) - IF(e.role = 'DRIVER', 40, 60)) AS excess_hours
  FROM employees e 
  JOIN stores s ON s.id = e.store_id 
  LEFT JOIN segments x ON x.employee_id = e.id
  GROUP BY e.id, e.name, e.role, s.city 
  ORDER BY e.id;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "id": 1,
      "name": "Kamal Perera",
      "role": "DRIVER",
      "city": "Colombo",
      "actual_hours": "32.5",
      "reserved_hours": "4.0",
      "weekly_limit": 40,
      "excess_hours": "0.0"
    },
    {
      "id": 2,
      "name": "Sunil Shantha",
      "role": "ASSISTANT",
      "city": "Colombo",
      "actual_hours": "41.0",
      "reserved_hours": "6.0",
      "weekly_limit": 60,
      "excess_hours": "0.0"
    }
  ]
  ```

---

### 2.5 Monthly Truck Fleet Utilization (`/api/reports/trucks`)
* **HTTP Method & Path:** `GET /api/reports/trucks`
* **Access Control:** `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `month`: String in `YYYY-MM` format
* **Plain-English Description:**  
  Measures vehicle fleet efficiency: aggregates completed road delivery trips, actual operating hours, and calculates percentage utilization assuming 8 available vehicle hours per calendar day in that month.
* **Underlying SQL Query:**
  ```sql
  WITH b AS (
    SELECT DATE(?) AS a
  ), 
  logs AS (
    SELECT 
      w.truck_id,
      IF(w.starts >= b.a AND w.starts < b.a + INTERVAL 1 MONTH, 1, 0) AS trip_count,
      TIMESTAMPDIFF(MINUTE, GREATEST(w.starts, b.a), LEAST(w.finishes, b.a + INTERVAL 1 MONTH)) / 60.0 AS hours
    FROM v_trip_windows w 
    CROSS JOIN b 
    WHERE status = 'COMPLETED'
      AND w.starts < b.a + INTERVAL 1 MONTH 
      AND w.finishes > b.a
  )
  SELECT 
    t.id,
    t.plate,
    s.city,
    COALESCE(SUM(l.trip_count), 0) AS completed_trips,
    COALESCE(SUM(l.hours), 0) AS actual_hours,
    DAY(LAST_DAY(b.a)) * 8 AS assumed_available_hours,
    ROUND(100 * COALESCE(SUM(l.hours), 0) / (DAY(LAST_DAY(b.a)) * 8), 2) AS utilization_percent
  FROM trucks t 
  JOIN stores s ON s.id = t.store_id 
  CROSS JOIN b 
  LEFT JOIN logs l ON l.truck_id = t.id
  GROUP BY t.id, t.plate, s.city, b.a 
  ORDER BY t.id;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "id": 1,
      "plate": "WP-LA-8821",
      "city": "Colombo",
      "completed_trips": 18,
      "actual_hours": "94.50",
      "assumed_available_hours": 248,
      "utilization_percent": 38.10
    },
    {
      "id": 2,
      "plate": "WP-LB-9932",
      "city": "Colombo",
      "completed_trips": 22,
      "actual_hours": "112.00",
      "assumed_available_hours": 248,
      "utilization_percent": 45.16
    }
  ]
  ```

---

### 2.6 Customer Order Fulfillment History (`/api/reports/history`)
* **HTTP Method & Path:** `GET /api/reports/history`
* **Access Control:** `CUSTOMER` (scoped to own account), `ADMIN`, `FACTORY`
* **Query Parameters:**
  - `customer_id`: Required for staff roles; defaults to session user for customers
* **Plain-English Description:**  
  Generates a comprehensive order lifecycle history: aggregates items, total price, total units, target delivery date, current status, and embeds nested JSON arrays of items and road delivery dispatches.
* **Underlying SQL Query:**
  ```sql
  SELECT 
    o.id,
    o.placed_at,
    o.delivery_date,
    o.status,
    o.address,
    o.delivered_at,
    r.name AS route,
    s.city,
    v.total_value,
    v.total_quantity,
    (
      SELECT JSON_ARRAYAGG(JSON_OBJECT('product', p.name, 'quantity', i.quantity))
      FROM order_items i 
      JOIN products p ON p.id = i.product_id 
      WHERE i.order_id = o.id
    ) AS items,
    (
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'trip', d.id, 
        'start', d.actual_start, 
        'end', d.actual_end,
        'outcome', x.outcome, 
        'truck', t.plate, 
        'driver', e.name
      ))
      FROM delivery_trip_orders x 
      JOIN delivery_trips d ON d.id = x.trip_id
      JOIN trucks t ON t.id = d.truck_id 
      JOIN employees e ON e.id = d.driver_id 
      WHERE x.order_id = o.id
    ) AS deliveries
  FROM orders o 
  JOIN routes r ON r.id = o.route_id 
  JOIN stores s ON s.id = r.store_id
  JOIN v_order_totals v ON v.order_id = o.id 
  WHERE o.customer_id = ? 
  ORDER BY o.placed_at DESC;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "id": 104,
      "placed_at": "2026-10-01 10:15:00",
      "delivery_date": "2026-10-09",
      "status": "DELIVERED",
      "address": "45 Galle Road, Colombo 03",
      "delivered_at": "2026-10-09 14:20:00",
      "route": "Colombo Central Coastal",
      "city": "Colombo",
      "total_value": "45000.00",
      "total_quantity": 100,
      "items": [
        { "product": "Kandy Royal Toffee (500g)", "quantity": 60 },
        { "product": "Ceylon Cinnamon Drops (250g)", "quantity": 40 }
      ],
      "deliveries": [
        {
          "trip": 14,
          "start": "2026-10-09 09:00:00",
          "end": "2026-10-09 14:45:00",
          "outcome": "DELIVERED",
          "truck": "WP-LA-8821",
          "driver": "Kamal Perera"
        }
      ]
    }
  ]
  ```

---

### 2.7 Security & Compliance Audit Log (`/api/reports/audit`)
* **HTTP Method & Path:** `GET /api/reports/audit`
* **Access Control:** `ADMIN` only
* **Query Parameters:** None
* **Plain-English Description:**  
  Inspects the immutable system security log: displays the last 200 system mutations across all business tables, showing the acting user (`actor_id`), table name, action (`INSERT`, `UPDATE`, `DELETE`), timestamp, and JSON before/after snapshots.
* **Underlying SQL Query:**
  ```sql
  SELECT * FROM audit_log ORDER BY id DESC LIMIT 200;
  ```
* **Sample JSON Response:**
  ```json
  [
    {
      "id": 482,
      "actor_id": 1,
      "changed_at": "2026-10-10 16:45:12",
      "entity": "orders",
      "action": "UPDATE",
      "old_values": { "id": 105, "status": "PENDING" },
      "new_values": { "id": 105, "status": "CANCELLED" }
    },
    {
      "id": 481,
      "actor_id": 2,
      "changed_at": "2026-10-10 16:30:00",
      "entity": "train_allocations",
      "action": "INSERT",
      "old_values": null,
      "new_values": { "id": 89, "order_id": 105, "quantity": 50, "train_trip_id": 12 }
    }
  ]
  ```
