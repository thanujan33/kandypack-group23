# Developer 2 notes — Products & Orders

Owner: D2 · Branch: `feature/d2-orders` · Reviewer: D1 · I review: D3

## SQL explanations

### Phase 1 — tables and view (`010_orders.sql`, part 1)

- **Header/lines split (`orders` + `order_items`).** One order has one customer,
  one delivery route and one delivery date, but many product lines. Putting the
  header fields on every line would repeat them and let them disagree, so the
  header is stored once in `orders` and each product line is one row in
  `order_items`. The composite primary key `(order_id, product_id)` means the
  same product cannot appear twice in one order. D3's composite foreign key
  `(order_id, product_id)` will point at exactly this key, so an unrelated
  product can never be allocated to an order.
- **Saved price and space (`unit_price`, `space_rate` in `order_items`).** These
  are copies of the catalog values at the moment of ordering. A later catalog
  price change does not rewrite past sales (6 x 125.00 stays 750.00 even if the
  price becomes 150.00).
- **`line_total` is `GENERATED ALWAYS ... STORED`.** The database computes
  `quantity * unit_price`, so nobody can insert a wrong line value
  (an explicit `line_total` is rejected with error 3105).
- **No stored order total; `v_order_totals` derives it.** The view sums the
  saved lines per order: value, quantity (selling units) and space (abstract
  train/truck units). There is no second number to keep in sync. Quantity and
  space are different measurements and must not be mixed up.
- **Foreign keys.** `orders.customer_id -> users.id`, `orders.route_id ->
  routes.id`, `order_items.order_id -> orders.id`, `order_items.product_id ->
  products.id` reject orders and lines that name something that does not exist.
- **Status ENUM.** `PENDING` is the starting state. The other values are used
  later by D3 (rail) and D4 (road). The order of the values is fixed by the
  shared contract.
- **CHECK constraints.** Prices and space rates must be above zero and a
  quantity must be a whole number from 1 to 100000. The database enforces this
  even if the UI or API is bypassed.
- **Indexes on `orders`.** `ix_orders_customer_date (customer_id, placed_at)`
  supports a customer's date-filtered history, `ix_orders_date (placed_at)`
  supports date-range reports and `ix_orders_status_route (status, route_id)`
  helps find orders ready for a route. MySQL also adds an index for each
  foreign key.
- **Products are retired, not deleted** (`active` flag) because order lines
  reference them.
- **The lead-time triggers and `sp_place_order` are not in this part yet.**
  They arrive in Phase 2, so for now an order can be inserted with any
  delivery date.

### Phase 2 — lead-time triggers and `sp_place_order`

- **Two places for the 7-day rule.** The procedure compares the requested date with `CURRENT_DATE`; the triggers compare `delivery_date` with the row's **own** `placed_at`. Because the public procedure never lets the caller set `placed_at`, customers cannot back-date; D5's privileged importer can still load honest historical rows. Both messages are the shared contract.
- **Step-by-step trace of `sp_place_order`** with the real statement names: `START TRANSACTION` -> `SELECT id INTO v_lock FROM app_lock WHERE id=1 FOR UPDATE` (serialises business writes) -> validate customer/route -> validate date and address -> validate JSON array (1-100 lines) -> validate active products and whole positive quantities with `JSON_TABLE` -> reject duplicate products -> `INSERT INTO orders` -> `LAST_INSERT_ID()` -> `INSERT INTO order_items ... SELECT` (prices and space copied from `products`) -> `COMMIT` -> return `id` and `message`.
- **Atomicity.** The `EXIT HANDLER FOR SQLEXCEPTION` runs `ROLLBACK` then `RESIGNAL`, so a failure never leaves an order header without lines (tested: counts unchanged after 30+ failing calls).
- **`JSON_TABLE`** turns the request's JSON array into rows that can be joined with `products`.
- **Why the client does not send prices or the customer**: SQL looks them up; the API passes the signed-in user's ID.
- **Security:** `SQL SECURITY DEFINER` lets the low-privilege `kp_app` account create orders only through the procedure; direct inserts/updates on `orders`/`order_items` are denied (tested).
- **Time zone:** the 7-day rule depends on the session time zone; the app uses +05:30, and every manual test had to `SET time_zone='+05:30'` because the Docker server defaults to UTC.

## Verification log

### Phase 0 — Environment check — 2026-10-04

- Branch `feature/d2-orders` was clean and already up to date with `origin/main`
  (D1 foundation, PR #6, included).
- Fresh clone: `.env` and `backend/.env` did not exist. Created them from the
  `.env.example` files with a newly generated random `JWT_SECRET`
  (both files are git-ignored and not committed).
- `npm ci` succeeded (175 packages, 0 vulnerabilities). It printed an
  `EBADENGINE` warning: this laptop has Node v22.21.0 while `package.json`
  requires `>=24 <25`. It did not block installation or the API.
- `docker compose up -d db` pulled `mysql:8.4`; the container became healthy
  on host port 3307.
- `npm run migrate` applied `001_core.sql` (fresh database).
- `npm run provision` ran successfully (runtime grants ready).
- Local test data created directly with the admin DB connection by a temporary
  script (deleted afterwards, not committed). There is no `POST /stores`
  endpoint in D1's API, so the store had to be inserted with SQL:

  | Item | Value |
  |---|---|
  | ADMIN | `d2-admin@kandypack.test` |
  | FACTORY | `d2-factory@kandypack.test` |
  | CUSTOMER | `d2-customer@kandypack.test` |
  | Store | `D2_TEST_STORE` (id 1) |
  | Route | `D2 Test Route`, coverage `D2 Test Coverage Zone` (id 1) |

- Started the API: `/api/health` returned `ok`; all three accounts signed in
  and `/api/me` returned the matching roles; `/api/directory` listed the test
  route for the customer.
- Reminder: D5's seed needs empty `stores` and `orders`, so this test store and
  route must be cleared (or a disposable DB used) before the seed is run.

### Phase 1 — Tables and view — 2026-10-04

**Approach.** The migration runner stores a checksum of every applied file and
refuses to run if an applied file changes. `010_orders.sql` will grow in
Phase 2 (triggers and `sp_place_order`), so Phase 1 was **not** applied to the
real `kandypack` database. Each step was applied to a freshly created scratch
database `kandypack_d2_scratch` (`DB_NAME=kandypack_d2_scratch node
scripts/migrate.js`), which was dropped afterwards. The real database still has
only `001_core.sql`; `010_orders.sql` is applied to it at the end of Phase 2
(together with `npm run provision`).

The file was built up in four commits, each tested on a fresh scratch database:

| Commit | Piece | What was tested on the scratch DB |
|---|---|---|
| `4af5513` | `products` | `010` applied cleanly. Valid product accepted. Rejected: duplicate name (1062), price 0, price -5 (3819, `products_chk_1`), space rate 0 (3819, `products_chk_2`). |
| `ea13749` | `orders` | Valid order accepted with default status `PENDING`, `placed_at` filled in and empty `instructions`. Rejected: unknown customer, unknown route (1452 foreign key), status `BOGUS` (1265). `SHOW INDEX` showed the three named indexes; the ENUM order matches the contract. |
| `3927be5` | `order_items` | Two lines inserted (6 x 125.00 = 750.00, 3 x 250.00 = 750.00). Rejected: duplicate `(order_id, product_id)` (1062), unknown order or product (1452), quantity 0, -2 and 100001 (3819), price 0, space 0 (3819), explicit `line_total` (3105). `line_total` is `STORED GENERATED` as `(quantity * unit_price)`. Primary key is `order_id,product_id`. |
| `31486ee` | `v_order_totals` | View returned value 1500.00, quantity 9, space 6.000 for the worked example. |

Extra checks on the finished file:

- After changing the catalog price of product 1 from 125.00 to 150.00 the saved
  line and `v_order_totals` still showed 1500.00 (price snapshot works).
- Sum of `line_total` (1500.00) equals the sum of `v_order_totals.total_value`
  (1500.00).
- An order with no lines does not appear in `v_order_totals` (2 orders, 1 view
  row). The order procedure in Phase 2 always inserts at least one line.
- `EXPLAIN SELECT id,placed_at,status FROM orders WHERE customer_id=1 AND
  placed_at>='2026-01-01'` used `ix_orders_customer_date` (type `range`,
  "Using index condition"). The table has only a couple of rows, so this shows
  what the index can do, not that every query on a tiny table must use it.
- The final file (41 lines) was compared with the tables and view in the
  Developer 2 handbook: identical.
- The test inserts bypassed the 7-day rule because the lead-time triggers do not
  exist yet (Phase 2).
- Scratch database dropped. `kandypack` still contains only `001_core.sql`.

### Phase 2 — Triggers and procedure — 2026-10-04

| Commit | Piece | What was tested on the scratch DB |
|---|---|---|
| `e3d64c6` | `orders_lead_insert` | t1 accepted; t2 rejected (Orders require at least 7 days notice); t3 historical ok; t4 historical too soon rejected. |
| `ef46342` | `orders_lead_update` | status update ok; early delivery date update rejected; +10 days update ok. |
| `cffa20f` | `sp_place_order` | P1: id=1, Order placed, 1500.00 / 9 / 6.000. P2-P7: rejected with exact contract messages. P8: orders=1, headers without lines=0, lines=2. P9: old order totals unchanged. |
| `f188294` | NULL-item-list | Reproduced bug (headers without lines=1), fixed, retested (0). |

- The final file was compared with the handbook and differs only by the NULL guard on one line.
- `010_orders.sql` was applied to the real `kandypack` database at the end of Phase 2, followed by `npm run provision`.
- Grants verified: `kp_app` has `EXECUTE ON PROCEDURE kandypack.sp_place_order`, but NO `INSERT`/`UPDATE` on `orders` or `order_items`. 
- Direct `INSERT`/`UPDATE` as `kp_app` on `orders` were denied (ERROR 1142). `CALL` executed but was rejected with 45000 as expected. Zero orders created in real DB.
- The scratch database was dropped.

## Bugs & trade-offs

- **Defect fixed:** `sp_place_order` had a bug where `p_items IS NULL` bypassed JSON length checks, leaving a header without lines. Reproduced and fixed with `p_items IS NULL OR...` in one line.
- **Trade-off/lesson:** The Docker server defaults to UTC, but the app uses `+05:30` (Sri Lanka time). The 7-day rule depends on the session time zone, so every manual test required `SET time_zone='+05:30'`.
- **Trade-off:** testing on a scratch database instead of the real one, to keep
  the migration checksum valid while `010_orders.sql` is still being extended.
  Mistake while doing this: the first scratch run used the wrong script path and
  failed with `MODULE_NOT_FOUND` before touching any database; it was re-run from
  the correct folder.

## Screenshots

_None yet._

## Review of D3

_Pending D3's pull request._
