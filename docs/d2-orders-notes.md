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

## Bugs & trade-offs

_None recorded yet._

## Screenshots

_None yet._

## Review of D3

_Pending D3's pull request._
