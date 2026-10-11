# KandyPack — 10-Minute Presentation & Oral Defense Script

> **Semester 3 Database Systems · Group 23**  
> **Course:** CS2043 Database Systems  
> **Application:** KandyPack Intermodal Rail-and-Road Distribution Platform  
> **Target Audience:** Course Evaluators, Academic Examiners & Technical Assessors

---

## 1. Quick Reference & Demo Credentials

All seeded test accounts utilize the shared environment password configured in your root `.env` / `backend/.env` file (`DEMO_PASSWORD`):

| Role | Email Login | Operating Domain & Capabilities |
| :--- | :--- | :--- |
| **Customer** | `customer1@kandypack.test` | Places 7-day advance orders, inspects consignment lifecycles, cancels pending orders. |
| **Factory Dispatcher** | `factory@kandypack.test` | Manages Kandy Yard rail timetables, executes bin-packing cursor allocations, dispatches trains. |
| **Store Manager** | `colombo@kandypack.test` | Receives rail lots at Colombo depot, enforces 40h/60h crew labor rosters, dispatches road trips. |
| **System Administrator** | `admin@kandypack.test` | Full tenant directory, quarterly revenue analytics, staff provisioning, immutable audit log. |

---

## 2. Minute-by-Minute Demo Script

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          10-MINUTE DEMO TIMELINE                            │
│                                                                             │
│ [00:00 - 01:00] Scene 1: Introduction & Architecture Overview               │
│ [01:00 - 03:30] Scene 2: Customer Consignment & Lead Time Database Guards  │
│ [03:30 - 05:30] Scene 3: Factory Rail Scheduling & Greedy Bin-Packing       │
│ [05:30 - 08:00] Scene 4: Regional Store Receiving & Road Final-Mile Fleet   │
│ [08:00 - 10:00] Scene 5: Analytics Intelligence & Immutable Audit Trail     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Scene 1: Introduction & Architecture Overview (00:00 – 01:00)

* **Speaker Action:** Open the application homepage at `http://localhost:5173` (or `http://localhost:3000`).
* **What to Say:**
  > *"Good morning, examiners. Today Group 23 presents KandyPack — an enterprise intermodal distribution platform engineered for Sri Lanka's confectioneries supply chain.*  
  >  
  > *Our architecture solves a classic bi-modal supply chain challenge: wholesale goods manufactured at the central Kandy factory cannot be shipped directly by road to distant cities due to terrain and traffic constraints. Instead, goods move via high-capacity railway line-haul from Kandy Goods Yard to regional depot stores (such as Colombo, Galle, and Negombo), where they are cross-docked and dispatched via road delivery fleets for final-mile delivery.*  
  >  
  > *What sets KandyPack apart from typical web apps is our **database-centric architecture**: rather than keeping business logic in Node.js, we have pushed transaction isolation, greedy bin-packing, labor compliance, pricing immutability, and security auditing directly into MySQL 8.4 using stored procedures, triggers, views, and pessimistic row locking."*

---

### Scene 2: Customer Ordering & Lead Time Database Guards (01:00 – 03:30)

* **Speaker Action:** Sign in using `customer1@kandypack.test`.
* **Step-by-Step Clicks:**
  1. Click **Orders** tab in top navigation.
  2. Point out the top KPI counters (*Total Consignments*, *Pending Allocation*, *In-Transit Pipe*, *Delivered Final*).
  3. Under **Products & Warehouse Inventory**, type `"Toffee"` in search to demonstrate live SKU filtering.
  4. Under **Place Advance Consignment Order**:
     - Select Product: `Kandy Royal Toffee (500g)` $\rightarrow$ Quantity: `20` $\rightarrow$ Click **Add to Cart**.
     - Select Product: `Ceylon Cinnamon Drops (250g)` $\rightarrow$ Quantity: `15` $\rightarrow$ Click **Add to Cart**.
  5. Under **Step 2: Destination & Delivery Date**:
     - Choose Coverage: `Colombo | Colombo Central A`.
     - Enter Address: `45 Galle Road, Colombo 03`.
     - **Demonstrate Lead Time Guard:** Intentionally select **tomorrow's date** (less than 7 days ahead) $\rightarrow$ Click **Confirm & Place Order**.
     - **Show Rejection:** The UI displays an error alert banner: `"Delivery date must be at least 7 days from placement"`.
     - Select a valid delivery date (e.g., **10 days from today**) $\rightarrow$ Click **Confirm & Place Order**.
     - Order confirms with order tracking number (e.g., `#KP-41`).
  6. Scroll down to **Inspect Order Lifecycle & Consignment Manifest**:
     - Select the new order from the dropdown $\rightarrow$ Click **Inspect Consignment**.
     - Point to the visual **`<Stepper>`**: Highlight that Step 1 (*Placed*) is active and current status is `PENDING`.
  7. **Demonstrate Order Cancellation:**
     - Point out the **Cancel Order** button inside the inspection drawer (or the *Cancel a Pending Order* panel).
     - Explain that customers have the legal right to cancel an order as long as it has not yet been locked onto a departing freight train.
* **What to Say (Database Focus):**
  > *"Notice that when we entered a delivery date fewer than 7 days ahead, the rejection didn't just happen in JavaScript. It was caught by our database trigger `orders_lead_insert` executing a `SIGNAL SQLSTATE '45000'`.  
  >  
  > Furthermore, when the order was placed via `sp_place_order`, the procedure took a **point-in-time snapshot** of `unit_price` and `space_rate` directly into `order_items`. If marketing changes wholesale prices tomorrow, existing orders and audited revenues remain completely uncorrupted."*

---

### Scene 3: Factory Rail Scheduling & Greedy Bin-Packing (03:30 – 05:30)

* **Speaker Action:** Sign out and log in as `factory@kandypack.test`.
* **Step-by-Step Clicks:**
  1. Click the **Rail** tab.
  2. Review the **Train Trips & Timetable Capacity** data table:
     - Point out columns: *Reference*, *Destination*, *Departure*, *Arrival*, *Status*, *Capacity*, and *Available*.
     - Explain that available capacity is dynamically calculated by database view `v_train_capacity`.
  3. Under **Allocate Pending Order to Train**:
     - Select the customer's pending order from the dropdown.
     - Select a scheduled train heading to Colombo (e.g., `EXP-0881`).
     - Click **Allocate & Bin-Pack**.
  4. Return to **Orders** tab $\rightarrow$ Inspect the order:
     - Show the **`<Stepper>`**: Step 1 (*Placed*) is completed with a green checkmark, and Step 2 (*Rail Allocated*) is now active! Status has transitioned to `ALLOCATED`.
  5. Return to **Rail** tab $\rightarrow$ Under **Dispatch Scheduled Train**:
     - Select the train $\rightarrow$ Click **Dispatch to Mainline**.
     - Train status transitions to `IN_TRANSIT`.
     - Inspect the order again $\rightarrow$ The `<Stepper>` now shows Step 3 (*Rail Transit*) pulsing with an active train beacon and status `ON_TRAIN`.
* **What to Say (Database Focus):**
  > *"When we clicked Allocate, MySQL executed stored procedure `sp_allocate_order`. This procedure uses a **cursor loop** implementing a greedy bin-packing algorithm. If an order's physical cubic volume exceeds the available wagon space on the first train, the procedure automatically splits the cargo lot across successive departures.  
  >  
  > To prevent race conditions where two factory dispatchers allocate to the same train simultaneously, the procedure acquires an exclusive write lock on our singleton row in `app_lock` using `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` under `READ COMMITTED` isolation."*

---

### Scene 4: Regional Store Receiving & Road Final-Mile Fleet (05:30 – 08:00)

* **Speaker Action:** Sign out and log in as `colombo@kandypack.test`.
* **Step-by-Step Clicks:**
  1. Note that the Colombo Store Manager **only sees Colombo depot data** (store isolation).
  2. Click **Rail** tab:
     - Under **Confirm Depot Receipt or Reconcile Shortages**:
     - Select the allocation lot for our order from the dropdown.
     - Enter the confirmed received quantity $\rightarrow$ Click **Confirm Depot Receipt**.
     - Point out: order status transitions to `AT_STORE`.
  3. Click **Road** tab:
     - Point out the **Depot Truck Fleet** and **Rostered Staff & Committed Hours** tables.
     - Highlight the driver weekly hours column: explains the 40-hour driver limit and 60-hour assistant limit.
     - Expand **Manage Depot Fleet, Personnel & Availability**:
       - Show that truck and employee availability toggles use descriptive dropdowns displaying current plate, name, role, and status rather than free-typed IDs.
  4. Under **Plan & Reserve Final-Mile Road Delivery**:
     - Select Route: `Colombo Central A`.
     - In the **Orders Ready at Store** checklist, check the box for our order.
     - Select available Truck, licensed Driver, and Driver Assistant.
     - Select Planned Start and End times within today's window.
     - Click **Reserve Delivery Trip** $\rightarrow$ Order status transitions to `SCHEDULED`.
  5. Under **Dispatch or Cancel Planned Trip**:
     - Select the planned trip $\rightarrow$ Click **Execute Trip Action** (Dispatch Now).
     - Vehicle moves to `OUT`; order status transitions to `OUT_FOR_DELIVERY` (Step 6 on stepper).
  6. Under **Log Actual Trip Return & Delivery Outcomes**:
     - Select the returning trip.
     - Check the box for our order to confirm successful delivery.
     - Pick return timestamp $\rightarrow$ Click **Record Actual Return**.
     - Order status transitions to final terminal state: `DELIVERED`, with `delivered_at` timestamp recorded!
* **What to Say (Database Focus):**
  > *"During road scheduling, stored procedure `sp_schedule_delivery` triggers `sp_check_roster` and stored function `fn_work_minutes`. The database validates: (1) no truck double-booking, (2) mandatory 30-minute rest between consecutive routes, and (3) weekly labor caps of 40 hours for drivers and 60 hours for assistants, even when trips cross midnight.  
  >  
  > When the trip returned, unchecking any failed delivery automatically returns that order to `AT_STORE` with outcome `FAILED`, ready for rescheduling."*

---

### Scene 5: Analytics Dashboards & Immutable Security Audit Trail (08:00 – 10:00)

* **Speaker Action:** Sign out and log in as `admin@kandypack.test`.
* **Step-by-Step Clicks:**
  1. Click **Reports** tab.
  2. Click **Quarterly Sales Revenue** $\rightarrow$ Click **Run Analytics Query**:
     - Point out the gradient bar charts and monthly financial breakdown.
     - Click **Export CSV** $\rightarrow$ File downloads instantly.
  3. Click **Staff Weekly Hours & Rosters** $\rightarrow$ Click **Run Analytics Query**:
     - Shows driver hours audited against the 40h/60h legal limits.
  4. Click **Database Security Audit Trail** $\rightarrow$ Click **Run Analytics Query**:
     - Point out the audit ledger: rows showing `orders`, `train_allocations`, `delivery_trips`.
     - Highlight that every row records the exact acting user (`actor_id`), action verb, and before/after JSON states.
     - Explain the append-only trigger protection: database triggers `audit_no_update` and `audit_no_delete` reject any `UPDATE` or `DELETE` with SQLSTATE `45000`.
* **What to Say (Conclusion):**
  > *"In summary, KandyPack delivers an end-to-end operational logistics platform backed by 14 normalized tables, 10 stored procedures, 1 stored function, 8 integrity triggers, dynamic audit triggers, and disaster recovery verified to 100% parity. Thank you, and we welcome your questions."*

---

## 3. Database Viva & Oral Defense Cheat Sheet

### Q1: Why did you snapshot `unit_price` and `space_rate` in `order_items` instead of joining `products`?
**Answer:**  
In commercial and logistics databases, referencing live product tables for historical orders is a critical data corruption flaw. When an order is committed, the price and package dimensions represent a legally binding agreement. If a product price increases in `products` next month, joining `products` would retroactively falsify historical quarterly revenues, past invoices, and tax calculations. Storing locked snapshots in `order_items` satisfies 2NF/3NF because the price at placement is functionally dependent on the order line item itself.

---

### Q2: How do you prevent race conditions when multiple dispatchers allocate cargo to the same train simultaneously?
**Answer:**  
We implement **pessimistic serialization** using a dedicated single-row table `app_lock`. Inside `sp_allocate_order`, the first statement is:
```sql
SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE;
```
Under `READ COMMITTED` isolation, MySQL acquires an exclusive row write lock (`X-lock`). Any concurrent transaction attempting to allocate cargo blocks until the first transaction commits or rolls back. When the second transaction unblocks, it reads updated capacity from `v_train_capacity`, correctly overflowing excess cargo to the next departure rather than overselling the wagon.

---

### Q3: How does the system record who made a change in the audit trail when the backend uses a shared connection pool (`kp_app`)?
**Answer:**  
In [`backend/src/db.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/db.js), our wrapper executes:
```javascript
await c.query('SET @actor = ?', [actorId || null]);
```
before any mutating transaction, where `actorId` is decoded from the JWT token. The MySQL `AFTER INSERT/UPDATE/DELETE` triggers read `@actor` and write it into `audit_log.actor_id`. In the `finally` block, we reset `SET @actor = NULL` and release the connection back to the pool, ensuring zero cross-request contamination.

---

### Q4: How is the audit log protected from tampering or deletion by an administrator?
**Answer:**  
Migration `041_audit.js` installs two kernel-level database triggers on `audit_log`:
```sql
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are append only';

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit records are append only';
```
Even if a superuser attempts an explicit `DELETE FROM audit_log` or `UPDATE audit_log`, the InnoDB engine aborts the statement with an uncatchable exception.

---

### Q5: How do you handle driver weekly work hours when trips cross midnight or ISO week boundaries?
**Answer:**  
Stored function `fn_work_minutes` and database views `v_trip_windows` and `v_staff_windows` compute the exact intersection between the trip window and the calendar boundary:
$$\text{Overlap} = \max(0, \min(\text{trip\_end}, \text{week\_end}) - \max(\text{trip\_start}, \text{week\_start}))$$
Hours before Sunday 23:59:59 count toward the current week, while minutes after Monday 00:00:00 automatically contribute to the following week's 40-hour quota.

---

### Q6: Why did you use `READ COMMITTED` instead of `SERIALIZABLE` isolation?
**Answer:**  
MySQL's default `REPEATABLE READ` and `SERIALIZABLE` employ extensive gap locks and next-key locks, which cause frequent deadlocks under concurrent cursor insertions and bin-packing. By adopting `READ COMMITTED` combined with **explicit pessimistic row locks on `app_lock`**, we achieve strict determinism for critical mutations while maintaining high read throughput for reporting dashboards.

---

### Q7: How do you prove that backups can be restored without data loss?
**Answer:**  
We authored [`backend/scripts/verify-restore.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/scripts/verify-restore.js). In testing, we dumped the database using `--single-transaction --routines --triggers --events`, restored the dump into an isolated scratch database `kandypack_scratch_restore`, and executed an automated query comparing row counts across all 14 tables, all 12 routines, and all 30 triggers. The verification confirmed **100% parity with zero data loss**, documented in [`docs/backup-restore.md`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/docs/backup-restore.md).
