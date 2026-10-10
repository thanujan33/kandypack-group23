# KandyPack — Database Design, Normalization & Stored Logic Specification

> **Semester 3 Database Systems · Group 23**  
> **Course:** CS2043 Database Systems  
> **Target RDBMS:** MySQL 8.4 Community Edition (InnoDB)  
> **Default Transaction Isolation Level:** `READ COMMITTED`

---

## 1. Academic Normalization Analysis

The KandyPack relational schema was engineered through rigorous normalisation principles (1NF through BCNF) to eliminate insert, update, and delete anomalies while intentionally preserving point-in-time denormalization snapshots where financial auditability requires immutability.

### 1.1 First Normal Form (1NF)
* **Atomic Columns:** All table attributes hold scalar, indivisible values. Multi-valued repeating groups (e.g., items within an order, wagons assigned to a consignment) are factored out into dedicated child entity tables (`order_items`, `train_allocations`, `delivery_trip_orders`).
* **Unique Identification:** Every relation defines an explicit Primary Key (surrogate `INT AUTO_INCREMENT` or natural composite key such as `(order_id, product_id)`).

### 1.2 Second Normal Form (2NF)
* A relation in 1NF is in 2NF if every non-prime attribute is fully functionally dependent on the entire primary key, with zero partial functional dependencies on proper subsets of candidate keys.
* **Analysis of Composite Keys:**
  - `order_items (order_id, product_id)`: Attributes `quantity`, `unit_price`, and `space_rate` depend strictly on both the specific order and product instance. The product's current catalog attributes are stored in `products`, while `order_items` stores the locked snapshot values agreed upon at order placement.
  - `delivery_trip_orders (trip_id, order_id)`: Attribute `outcome` depends on the combination of the road trip and the order.
  - All other relations use single-attribute surrogate keys (`id`), satisfying 2NF trivially.

### 1.3 Third Normal Form (3NF) & Boyce-Codd Normal Form (BCNF)
* A relation is in 3NF if it is in 2NF and no non-prime attribute is transitively dependent on the primary key.
* A relation is in BCNF if for every non-trivial functional dependency $X \rightarrow Y$, $X$ is a superkey.
* **Evaluation:**
  - `orders`: `customer_id` and `route_id` reference parent entities. Delivery address and instructions are attributes of the specific order, not the route or customer.
  - `routes`: `coverage_area` is unique; `max_minutes` depends on the route.
  - `employees`: `nic` is a unique candidate key; attributes depend solely on the employee.
  - `train_trips`: `reference` is an alternate unique candidate key; `store_id`, `departure_at`, `arrival_at`, and `capacity` depend strictly on `id` and `reference`.

---

## 2. Intentional Denormalization & Point-in-Time Snapshots

A frequent anti-pattern in commercial ordering databases is referencing the live product catalog table for historical order pricing. In real-world enterprise databases, this creates fatal financial and legal corruption: if a product's price increases next month, all historical orders and audited financial reports would retroactively alter.

### 2.1 The `order_items` Snapshot Rationale
In `order_items`:
```sql
CREATE TABLE order_items (
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,   -- POINT-IN-TIME SNAPSHOT
  space_rate DECIMAL(10,3) NOT NULL,   -- POINT-IN-TIME SNAPSHOT
  line_total DECIMAL(16,2) GENERATED ALWAYS AS (quantity*unit_price) STORED,
  PRIMARY KEY(order_id, product_id), ...
);
```

#### Why `unit_price` and `space_rate` are Copied:
1. **Contractual & Financial Immutability:** When a customer commits an order via `sp_place_order`, the agreed transaction price is frozen. If the marketing team edits `products.unit_price` from LKR 400.00 to LKR 650.00, past invoice totals, tax calculations, and revenue ledgers remain exactly as contracted.
2. **Physical Packing Consistency:** Packaging volume per SKU (`space_rate`) represents the pallet/box specification at placement. If manufacturing modifies packaging dimensions later, existing orders must still allocate wagon and truck capacity based on the original agreed physical volume.
3. **Automated Verification:** The test suite explicitly validates this invariant (`test/api.test.js` $\rightarrow$ *"order prices remain unchanged after catalog edit"*), proving that modifying `products` has zero effect on existing `order_items`.

### 2.2 Planned vs. Actual Timestamps in `delivery_trips`
In `delivery_trips`:
* `planned_start` and `planned_end` represent the **reserved schedule window** used for driver/assistant labor law compliance (40h/week limit for drivers, 60h/week for assistants).
* `actual_start` and `actual_end` record the **physical gate telemetry** recorded upon dispatch and return.
* Maintaining both allows SLA variance reporting, utilization analytics (`v_truck_usage`), and audit tracing without data destruction.

---

## 3. Stored Routines & Database Logic Matrix

Unlike architectures where business logic resides exclusively in Node.js, KandyPack enforces all data integrity, state transitions, bin-packing, and concurrency rules directly inside the MySQL storage engine via stored procedures, triggers, views, and functions.

### 3.1 Stored Procedures

| Procedure Name | Migration File | Primary Purpose | Tables Read | Tables Mutated | Locks & Concurrency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sp_place_order` | `010_orders.sql` | Validates customer, route, 7-day lead time, integer quantities, snapshots prices/space rates, and inserts order + items atomically. | `users`, `routes`, `products` | `orders`, `order_items`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_cancel_order` | `050_order_cancellation.sql` | Enforces ownership and strict `PENDING` status checks before cancelling orders and unlocking downstream capacity. | `orders` | `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_allocate_order` | `020_rail.sql` | Executes a **greedy bin-packing cursor loop** over scheduled trains departing before the order due date, splitting overflow across multiple wagons until order is fully allocated. | `orders`, `order_items`, `train_trips`, `v_train_capacity` | `train_allocations`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_refresh_order` | `020_rail.sql` | Evaluates allocation lot states, train statuses, and receipt flags to synchronize `orders.status` (`PENDING`, `ALLOCATED`, `ON_TRAIN`, `PARTIAL_AT_STORE`, `AT_STORE`, `MISSING`). | `train_allocations`, `train_trips`, `order_items` | `orders` | Internal sub-routine |
| `sp_dispatch_train`| `020_rail.sql` | Transitions train from `SCHEDULED` to `IN_TRANSIT` if departure time has arrived; calls `sp_refresh_order` for all allocated orders. | `train_trips`, `train_allocations` | `train_trips`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_receive_allocation`| `020_rail.sql` | Records depot receipt of a cargo lot, verifies shortfalls against ordered lot quantities, updates `received_qty`, and synchronizes order status. | `train_allocations`, `train_trips` | `train_allocations`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_check_roster` | `030_road.sql` | Comprehensive validation of road roster constraints: truck overlap, driver overlap, assistant overlap, mandatory 30-min driver rest, 3rd consecutive route limit, and weekly limits. | `delivery_trips`, `v_trip_windows`, `v_staff_windows` | None (Read-only guard) | Called inside triggers |
| `sp_schedule_delivery`| `030_road.sql` | Reserves a road trip, verifies orders are fully `AT_STORE`, confirms capacity of vehicle, bundles orders into `delivery_trip_orders`, and transitions orders to `SCHEDULED`. | `orders`, `routes`, `trucks`, `order_items` | `delivery_trips`, `delivery_trip_orders`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_dispatch_delivery`| `030_road.sql` | Dispatches vehicle onto the road; marks trip `OUT`, sets `actual_start`, and updates bundled orders to `OUT_FOR_DELIVERY`. | `delivery_trips`, `delivery_trip_orders` | `delivery_trips`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_cancel_delivery`| `030_road.sql` | Cancels a planned delivery trip, releasing reserved truck and staff hours and reverting bundled orders to `AT_STORE`. | `delivery_trips`, `delivery_trip_orders` | `delivery_trips`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |
| `sp_return_delivery`| `030_road.sql` | Processes trip return; marks trip `COMPLETED`, records `actual_end`, marks delivered orders as `DELIVERED`, and reverts undelivered orders to `AT_STORE` with `FAILED` outcome. | `delivery_trips`, `delivery_trip_orders` | `delivery_trips`, `delivery_trip_orders`, `orders`, `app_lock` | `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` |

---

### 3.2 Stored Functions

| Function Name | Migration File | Return Type | Purpose & Logic |
| :--- | :--- | :--- | :--- |
| `fn_work_minutes` | `030_road.sql` | `INT` | Calculates the exact overlap duration (in integer minutes) between an employee's rostered trip window and a specified calendar interval: $\max(0, \min(\text{end}_1, \text{end}_2) - \max(\text{start}_1, \text{start}_2))$. Handles trips that cross midnight and ISO week boundaries. |

---

### 3.3 Database Triggers

| Trigger Name | Migration File | Event & Timing | Target Table | Guard / Enforcement Description |
| :--- | :--- | :--- | :--- | :--- |
| `orders_lead_insert` | `010_orders.sql` | `BEFORE INSERT` | `orders` | Enforces that `NEW.delivery_date >= DATE(NEW.placed_at) + INTERVAL 7 DAY`. Rejects any order violating the 7-day advance lead time rule. |
| `orders_lead_update` | `010_orders.sql` | `BEFORE UPDATE` | `orders` | Prohibits retroactively shifting delivery dates to less than 7 days from the initial placement timestamp. |
| `allocation_guard` | `020_rail.sql` | `BEFORE INSERT` | `train_allocations` | Enforces: (1) Assigned train arrives at the same store as the order's route; (2) Train departs in the future ($\ge \text{NOW()}$); (3) Remaining unallocated order quantity is sufficient; (4) Train wagon available capacity is not exceeded. |
| `allocation_immutable`| `020_rail.sql` | `BEFORE UPDATE` | `train_allocations` | Prevents reducing `received_qty` once acknowledged and prevents modifying immutable identity columns (`train_trip_id`, `order_id`, `product_id`). |
| `train_edit_guard` | `020_rail.sql` | `BEFORE UPDATE/DELETE`| `train_trips` | Prohibits altering or deleting a scheduled train trip once cargo allocations have been bound to it. |
| `road_insert_guard` | `030_road.sql` | `BEFORE INSERT` | `delivery_trips` | Invokes `sp_check_roster` to validate driver qualifications, assistant assignment, vehicle capacity, rest intervals, and weekly labor hour caps before reserving. |
| `road_update_guard` | `030_road.sql` | `BEFORE UPDATE` | `delivery_trips` | Re-evaluates `sp_check_roster` on timetable modifications and prevents invalid state progressions. |
| `audit_no_update` | `041_audit.js` | `BEFORE UPDATE` | `audit_log` | Signals SQLSTATE `'45000'` with message: *"Audit records are append only"*. Guarantees tamper-evidence. |
| `audit_no_delete` | `041_audit.js` | `BEFORE DELETE` | `audit_log` | Signals SQLSTATE `'45000'` with message: *"Audit records are append only"*. Guarantees audit trail permanence. |
| `audit_{table}_{action}`| `041_audit.js` | `AFTER INSERT/UPDATE/DELETE` | 7 Core Entities | Dynamically serializes `OLD` and `NEW` records into JSON and records mutation timestamp along with `@actor` principal. |

---

### 3.4 Database Views

| View Name | Migration File | Purpose & Business Value |
| :--- | :--- | :--- |
| `v_order_totals` | `010_orders.sql` | Computes aggregate total value (LKR), total carton quantity, and total cubic space used per order from `order_items`. |
| `v_train_capacity` | `020_rail.sql` | Computes available wagon space for each train by subtracting $\sum(\text{space\_used})$ of active allocations from `train_trips.capacity`. |
| `v_trip_windows` | `030_road.sql` | Provides effective departure and completion intervals (`starts`, `finishes`) for road trips, gracefully coalescing actual timestamps over planned schedules. |
| `v_staff_windows` | `040_reports.sql` | Unrolls delivery trips across both drivers and assistants into a unified normalized schedule stream for weekly labor compliance. |
| `v_sales_lines` | `040_reports.sql` | Flattened operational view combining orders, customer, route, depot store, products, unit prices, line totals, and space rates. |
| `v_popular_products` / `v_quarterly_sales` | `040_reports.sql` | Analytical aggregation views backing reporting dashboards. |

---

## 4. Concurrency Control & Pessimistic Serialization

In multi-user logistics environments, concurrent transactions attempting to book train capacity or schedule truck fleet dispatches create classic **race conditions** (lost updates, double allocations, overselling train wagons).

### 4.1 The `app_lock` Mechanism
Rather than relying on table-level locking (which degrades MySQL throughput) or optimistic versioning (which causes high rollback abort rates during peak booking hours), KandyPack employs a **pessimistic serialization barrier**:

```sql
CREATE TABLE app_lock (
  id INT PRIMARY KEY,
  locked_at DATETIME NOT NULL
) ENGINE=InnoDB;

INSERT INTO app_lock (id, locked_at) VALUES (1, NOW());
```

Within critical stored procedures (`sp_place_order`, `sp_allocate_order`, `sp_schedule_delivery`, `sp_cancel_order`):
```sql
SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
```

#### Why This Guarantees Correctness:
1. **Row-Level Mutual Exclusion:** Under `READ COMMITTED`, `SELECT ... FOR UPDATE` acquires an exclusive row-level write lock (`X-lock`) on the singleton row `id=1`.
2. **Deterministic Serialization:** Any concurrent connection attempting to execute an allocation or scheduling procedure will block until the active transaction either executes `COMMIT` or `ROLLBACK`.
3. **Prevention of Bin-Packing Overselling:** When two concurrent requests attempt to allocate large orders against the same departing train, the second transaction is forced to wait until the first commits. When the second runs, it reads the updated `available_capacity` from `v_train_capacity`, correctly overflowing remaining cargo to subsequent trains rather than overselling.
4. **Verified by Concurrency Tests:** The automated test suite explicitly tests this scenario (`test/api.test.js` $\rightarrow$ *"two concurrent allocations cannot oversell the same trains"*), launching parallel asynchronous allocation calls and proving zero capacity violations.

---

## 5. Security & Immutable Audit Trail

### 5.1 Actor Attribution via `@actor`
In modern microservices and web backends, all database connections originate from a shared connection pool user (e.g., `kp_app`). Without special handling, database triggers cannot distinguish which end-user made a modification.

KandyPack resolves this via session variable injection in [`backend/src/db.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/db.js):
```javascript
export async function transaction(actorId, work) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query('SET @actor = ?', [actorId || null]);
    const result = await work(c);
    await c.commit();
    return result;
  } catch (err) {
    await c.rollback();
    throw err;
  } finally {
    await c.query('SET @actor = NULL');
    c.release();
  }
}
```

### 5.2 Dynamic Change Data Capture Triggers
Migration `041_audit.js` automatically creates `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` triggers across all business tables.
For every mutation, the trigger captures:
* `@actor`: The authenticated user ID extracted from the HTTP JWT token.
* `table_name`: The entity modified.
* `action`: The mutation verb (`INSERT`, `UPDATE`, `DELETE`).
* `old_values`: `JSON_OBJECT(...)` snapshot of `OLD` record state (for `UPDATE` and `DELETE`).
* `new_values`: `JSON_OBJECT(...)` snapshot of `NEW` record state (for `INSERT` and `UPDATE`).

### 5.3 Tamper-Evident Immutability
To guarantee compliance and satisfy forensic audit criteria, `audit_log` is physically protected by database triggers:
```sql
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are append only';

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are append only';
```
Even if an administrative user attempts an explicit `UPDATE audit_log` or `DELETE FROM audit_log`, the InnoDB engine rejects the operation at the kernel level.
