# KandyPack — Architecture & File Structure Reference
> Group 23 · Semester 3 Database Systems Project

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Repository Layout](#3-repository-layout)
4. [Infrastructure Layer](#4-infrastructure-layer)
5. [Backend Deep-Dive](#5-backend-deep-dive)
   - 5.1 [Entry Point — `server.js`](#51-entry-point--serverjs)
   - 5.2 [Database Layer — `db.js`](#52-database-layer--dbjs)
   - 5.3 [HTTP Utilities — `http.js`](#53-http-utilities--httpjs)
   - 5.4 [Authentication — `auth.js`](#54-authentication--authjs)
   - 5.5 [Route Modules](#55-route-modules)
6. [Database Schema](#6-database-schema)
   - 6.1 [Migration Strategy](#61-migration-strategy)
   - 6.2 [Core Tables (`001_core.sql`)](#62-core-tables-001_coresql)
   - 6.3 [Orders & Products (`010_orders.sql`)](#63-orders--products-010_orderssql)
   - 6.4 [Rail Allocation (`020_rail.sql`)](#64-rail-allocation-020_railsql)
   - 6.5 [Road Delivery (`030_road.sql`)](#65-road-delivery-030_roadsql)
   - 6.6 [Audit Log (`041_audit.js`)](#66-audit-log-041_auditjs)
7. [Stored Procedures & Business Logic](#7-stored-procedures--business-logic)
8. [Frontend Deep-Dive](#8-frontend-deep-dive)
   - 8.1 [Entry Point — `main.jsx`](#81-entry-point--mainjsx)
   - 8.2 [API Client — `api.js`](#82-api-client--apijs)
   - 8.3 [Shared UI Components — `components/UI.jsx`](#83-shared-ui-components--componentsuijsx)
   - 8.4 [Module Pages](#84-module-pages)
9. [Role-Based Access Control (RBAC)](#9-role-based-access-control-rbac)
10. [Order Lifecycle State Machine](#10-order-lifecycle-state-machine)
11. [Developer Scripts](#11-developer-scripts)
12. [NPM Workspaces & Scripts](#12-npm-workspaces--scripts)
13. [Environment Configuration](#13-environment-configuration)
14. [Full Annotated File Tree](#14-full-annotated-file-tree)

---

## 1. Project Overview

**KandyPack** is a full-stack product-order distribution management system for a factory based in Kandy, Sri Lanka. It models a two-leg delivery supply chain:

1. **Rail leg** — Goods are loaded from the Kandy factory onto scheduled train trips and dispatched to regional store depots.
2. **Road leg** — Stores receive the goods, then plan and execute last-mile truck deliveries to customers.

The system handles the entire lifecycle: customer order placement → rail allocation → train dispatch → store receipt → road scheduling → delivery and return logging — with full audit trailing throughout.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Port 5173)                      │
│              React 19 SPA  ·  Vite 7  ·  Tailwind CSS 4         │
│   main.jsx → dynamic module loading → role-filtered nav tabs     │
└──────────────────────────┬───────────────────────────────────────┘
                           │  HTTP fetch /api/*
                           │  Bearer JWT in Authorization header
┌──────────────────────────▼───────────────────────────────────────┐
│                    Node.js 24 / Express 5                        │
│  server.js  ──►  auth middleware  ──►  *.routes.js modules       │
│                                                                   │
│  src/                                                            │
│  ├── server.js      (app bootstrap, static file serve)           │
│  ├── auth.js        (register, login, authenticate middleware)   │
│  ├── db.js          (pool, read(), transaction(), call())        │
│  ├── http.js        (fail(), int(), text(), roles(), checkStore) │
│  └── modules/                                                    │
│      ├── core.routes.js    (directory, users, routes, stores)   │
│      ├── orders.routes.js  (products, orders)                   │
│      ├── rail.routes.js    (trains, allocations, receipt)       │
│      ├── road.routes.js    (trucks, employees, trips)           │
│      └── reports.routes.js (quarterly, products, hours, audit)  │
└──────────────────────────┬───────────────────────────────────────┘
                           │  mysql2/promise · pool of 8 connections
                           │  IST timezone (+05:30)
┌──────────────────────────▼───────────────────────────────────────┐
│                    MySQL 8.4  (Docker, port 3307)                │
│  kandypack database  ·  kp_app restricted user                   │
│                                                                   │
│  Tables:  users, sessions, stores, routes, products, orders,     │
│           order_items, train_trips, train_allocations,           │
│           trucks, employees, delivery_trips,                      │
│           delivery_trip_orders, audit_log, app_lock              │
│                                                                   │
│  Views:   v_order_totals, v_train_capacity, v_trip_windows,      │
│           v_staff_windows, v_sales_lines                         │
│                                                                   │
│  Stored Procs: sp_place_order, sp_allocate_order,                │
│                sp_dispatch_train, sp_receive_allocation,          │
│                sp_refresh_order, sp_schedule_delivery,           │
│                sp_dispatch_delivery, sp_cancel_delivery,         │
│                sp_return_delivery                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Layout

```
KandyPack/
├── docs/                           ← External developer guides (HTML)
│   ├── D2_Implementation_Plan.md
│   ├── D2_Phase2_Execution_Plan_for_Gemini.md
│   ├── KandyPack_Common_Development_Guide (1).html
│   ├── KandyPack_Developer_1_Platform_Accounts (1).html
│   ├── KandyPack_Developer_2_Products_Orders (1).html
│   ├── KandyPack_Developer_3_Rail_Allocation (1).html
│   ├── KandyPack_Developer_4_Road_Rosters (1).html
│   └── KandyPack_Developer_5_Reports_Audit_Verification (1).html
└── kandypack-group23/              ← The actual codebase (git repo)
```

---

## 4. Infrastructure Layer

### Docker Compose (`compose.yaml`)

Two services are defined:

| Service | Image | Port mapping | Notes |
|---------|-------|-------------|-------|
| `db` | `mysql:8.4` | `127.0.0.1:3307:3306` | Always started; persisted via `mysql_data` volume |
| `app` | Custom `Dockerfile` | `127.0.0.1:3000:3000` | Only active under `--profile full`; used for production-like testing |

Key MySQL settings applied at container start:
- `--default-time-zone=+05:30` — all `CURRENT_TIMESTAMP` and `NOW()` calls return **Sri Lanka time**
- Root password injected from the root `.env` file via `MYSQL_ROOT_PASSWORD`
- Database name hardcoded to `kandypack`
- Health check polls `mysqladmin ping` every 5 s, up to 20 retries, before declaring healthy

### Dockerfile

Builds the backend with the pre-built `frontend/dist/` static files bundled. In production mode the Express server serves both the API (`/api/*`) and the static React bundle from the same port.

---

## 5. Backend Deep-Dive

The backend is a Node.js 24 application using **ES Modules** (`"type": "module"`), Express 5, and mysql2.

### 5.1 Entry Point — [`server.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/server.js)

Responsibilities:
1. Creates the Express app and disables `x-powered-by`.
2. Mounts `express.json()` with a 100 KB body limit.
3. Registers public routes:
   - `GET /api/health` — executes `SELECT 1` to confirm DB connectivity.
   - `POST /api/auth/register` and `POST /api/auth/login` via `authRouter`.
4. Applies the `authenticate` middleware to **all subsequent** `/api` routes — everything after this point requires a valid JWT.
5. Registers two inline protected routes: `GET /api/me` and `POST /api/logout`.
6. **Auto-discovers** all `*.routes.js` files inside `src/modules/` using `fs.readdir`, sorts them alphabetically, and dynamically imports each one. Each file must `export default` an Express Router.
7. Catches unknown `/api/*` paths with a 404 handler.
8. Serves the compiled React bundle from `frontend/dist/` as static files (production mode).
9. Global error handler maps MySQL error codes and `SQLSTATE '45000'` signals to appropriate HTTP status codes (400, 409, 500).
10. Listens on `process.env.PORT` (default `3000`) and `process.env.HOST` (default `127.0.0.1`).

> **Pattern**: All feature routes are plug-in modules. Adding a new `foo.routes.js` to `src/modules/` auto-registers it on the next server start — no changes to `server.js` required.

### 5.2 Database Layer — [`db.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/db.js)

Exports four primitives that all route handlers use:

| Export | Purpose |
|--------|---------|
| `pool` | Raw `mysql2` connection pool (8 connections max). Exposed for edge cases. |
| `connection(actor, work)` | Core wrapper. Acquires a connection, sets `time_zone=+05:30`, `READ COMMITTED` isolation, and `@actor` session variable (used by audit triggers). Releases the connection in `finally`. |
| `read(sql, args)` | Convenience for simple `SELECT` queries. Calls `connection(null, ...)` — no actor context. Returns the rows array directly. |
| `transaction(actor, work)` | Wraps `work` in `BEGIN / COMMIT`, rolling back on any error. Always called with the authenticated `user.id` as `actor`. |
| `call(actor, procedure, args)` | Calls a stored procedure by name. Validates the name against `/^sp_[a-z_]+$/` to prevent injection. Returns the first result set. |

**Audit mechanism**: Setting `@actor` before every mutating statement lets MySQL triggers (installed by `041_audit.js`) write the acting user's ID into `audit_log.actor_id` automatically, without the application needing to explicitly insert audit rows.

### 5.3 HTTP Utilities — [`http.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/http.js)

Five small, pure helpers used throughout all route handlers:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `fail` | `(message, status=400)` | Throws an `Error` with a `.status` property. Caught by the global error handler. |
| `int` | `(value, name)` | Parses and validates a positive safe integer. |
| `text` | `(value, name, max=255)` | Trims and validates a required string. |
| `roles` | `(...allowed)` | Returns Express middleware that checks `req.user.role` against the allowed list, throwing 403 if not matched. |
| `checkStore` | `(req, store)` | For `STORE` role users, asserts the record's `store_id` matches their own. Prevents cross-store data access. |

### 5.4 Authentication — [`auth.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/auth.js)

**Registration** (`POST /api/auth/register`):
- Validates email format and password length (12–72 chars, ≤72 UTF-8 bytes).
- Hashes the password with `bcrypt` at cost factor 12.
- Inserts a new row in `users` with default role `CUSTOMER`.

**Login** (`POST /api/auth/login`):
- In-memory per-IP rate limiter: max 20 attempts per 10-minute window (resets on success).
- Looks up the user by email and verifies the bcrypt hash.
- Generates a UUID session ID and inserts a `sessions` row (expires in 8 hours).
- Returns a signed **HS256 JWT** containing only the session ID `sid` in the payload (subject is `user.id`).

**`authenticate` middleware** (applied to all `/api` routes after auth):
- Strips `Bearer ` prefix from the `Authorization` header.
- Verifies the JWT signature and extracts `sid` and `sub`.
- Runs a single SQL query joining `sessions`, `users`, and `stores` to hydrate `req.user` with `id`, `name`, `email`, `role`, `sid`, and `store_id`.
- Validates that the session is not revoked, not expired (8 h hard), and not idle (30 min rolling).
- Updates `last_seen` on every authenticated request (rolling window).

**Logout** (`POST /api/logout`): Sets `revoked=1` on the session row. The next request from any tab using the same token will fail the `revoked=0` check.

### 5.5 Route Modules

All modules live in [`backend/src/modules/`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/) and are auto-loaded by `server.js`.

#### [`core.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/core.routes.js)

Manages the foundational platform entities.

| Endpoint | Method | Roles | Description |
|----------|--------|-------|-------------|
| `/api/directory` | GET | Any | Returns all stores and active routes. Used by every module for dropdowns. |
| `/api/users` | GET | ADMIN | Lists all users. |
| `/api/users/:id` | PATCH | ADMIN | Changes role / active flag. Guards: prevents self-edit, CUSTOMER↔staff transitions, and reassigning a store manager without first clearing the store link. |
| `/api/staff-users` | POST | ADMIN | Creates a new ADMIN, FACTORY, or STORE staff account. |
| `/api/stores/:id/manager` | PUT | ADMIN | Assigns a STORE-role user as manager of a store. |
| `/api/routes` | POST | ADMIN, FACTORY | Creates a new delivery route under a store. |
| `/api/routes/:id` | PATCH | ADMIN, FACTORY | Toggles a route's `active` flag. |

#### [`orders.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/orders.routes.js)

| Endpoint | Method | Roles | Description |
|----------|--------|-------|-------------|
| `/api/products` | GET | Any | Lists active products. |
| `/api/products` | POST | ADMIN, FACTORY | Creates a product. |
| `/api/products/:id` | PUT | ADMIN, FACTORY | Updates a product (price changes do not affect existing order snapshots). |
| `/api/orders` | GET | Any | Lists orders; CUSTOMERs see only their own; STORE sees only their store's orders. Supports `?from=` and `?to=` date filters. |
| `/api/orders/:id` | GET | Any | Returns an order with its line items. Access-controlled by role. |
| `/api/orders` | POST | CUSTOMER | Places an order via `sp_place_order`. |

**`sp_place_order`** validates: active customer/route, delivery date ≥ 7 days from now, 1–100 product lines with valid quantities and no duplicates. Prices are snapshotted from `products` at order time.

#### [`rail.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/rail.routes.js)

| Endpoint | Method | Roles | Description |
|----------|--------|-------|-------------|
| `/api/trains` | GET | ADMIN, FACTORY, STORE | Lists trains with remaining capacity via `v_train_capacity`. STORE users see only their store's trains. |
| `/api/trains` | POST | ADMIN, FACTORY | Creates a scheduled train trip. |
| `/api/trains/:id` | PUT | ADMIN, FACTORY | Updates a train's details (blocked if allocations exist). |
| `/api/rail/allocate` | POST | ADMIN, FACTORY | Calls `sp_allocate_order` — auto-fills order items across eligible trains. |
| `/api/trains/:id/dispatch` | POST | ADMIN, FACTORY | Calls `sp_dispatch_train` — moves train to `IN_TRANSIT` and updates order statuses. |
| `/api/rail/manifest` | GET | ADMIN, FACTORY, STORE | Shows all allocation records with product/customer context. |
| `/api/rail/receive` | POST | ADMIN, STORE | Calls `sp_receive_allocation` — records physically received quantity at the store depot. |

#### [`road.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/road.routes.js)

A `r.use('/road', roles('ADMIN','STORE'))` guard protects the entire `/road/*` namespace.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/road/resources` | GET | Returns trucks and employees for a store, including committed hours vs. weekly limit (computed via `fn_work_minutes`). |
| `/api/road/trucks` | POST | Adds a truck to a store's fleet. |
| `/api/road/employees` | POST | Adds a DRIVER or ASSISTANT employee to a store. |
| `/api/road/:kind/:id/active` | PATCH | Toggles `active` on trucks or employees. |
| `/api/road/trips` | GET | Lists delivery trips with route overrun warnings. |
| `/api/road/trips/:id/orders` | GET | Lists the orders assigned to a specific trip. |
| `/api/road/schedule` | POST | Calls `sp_schedule_delivery` — creates a planned delivery trip from selected orders. |
| `/api/road/trips/:id/dispatch` | POST | Calls `sp_dispatch_delivery`. |
| `/api/road/trips/:id/cancel` | POST | Calls `sp_cancel_delivery`. |
| `/api/road/trips/:id/return` | POST | Calls `sp_return_delivery` with an `actual_end` timestamp and a list of delivered order IDs. |

The three trip-action endpoints (`dispatch`, `cancel`, `return`) are registered in a loop to avoid repetition.

#### [`reports.routes.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/src/modules/reports.routes.js)

All reports are read-only queries against views.

| Endpoint | Roles | Description |
|----------|-------|-------------|
| `/api/reports/quarterly` | ADMIN, FACTORY | Monthly sales summary (orders, revenue, units, space) for a given quarter. |
| `/api/reports/products` | ADMIN, FACTORY | Per-product sales aggregation for a quarter. |
| `/api/reports/locations` | ADMIN, FACTORY | Sales by city and by route for a quarter. |
| `/api/reports/hours` | ADMIN, FACTORY | Employee hours breakdown (actual vs. reserved vs. weekly limit) for a week via `v_staff_windows`. |
| `/api/reports/trucks` | ADMIN, FACTORY | Per-truck trip count and utilization % for a calendar month via `v_trip_windows`. |
| `/api/reports/history` | ADMIN, FACTORY, CUSTOMER | Full order history with nested items and delivery attempts. CUSTOMERs see only their own. |
| `/api/reports/audit` | ADMIN | Last 200 `audit_log` entries. |

---

## 6. Database Schema

### 6.1 Migration Strategy

Migrations live in [`backend/db/migrations/`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/db/migrations/) and are numbered to enforce execution order. The `migrate.js` script runs them in sorted order against a tracking table. Files can be `.sql` (run directly) or `.js` (export an `up(connection)` async function for programmatic migrations).

| File | Developer | Contents |
|------|-----------|---------|
| `001_core.sql` | Dev 1 | `users`, `sessions`, `stores`, `routes` |
| `010_orders.sql` | Dev 2 | `products`, `orders`, `order_items`, view `v_order_totals`, triggers, `sp_place_order` |
| `020_rail.sql` | Dev 3 | `train_trips`, `train_allocations`, view `v_train_capacity`, triggers, `sp_allocate_order`, `sp_dispatch_train`, `sp_receive_allocation`, `sp_refresh_order` |
| `030_road.sql` | Dev 4 | `trucks`, `employees`, `delivery_trips`, `delivery_trip_orders`, views (`v_trip_windows`, `v_staff_windows`), triggers, stored procedures (`sp_schedule_delivery`, `sp_dispatch_delivery`, `sp_cancel_delivery`, `sp_return_delivery`), function `fn_work_minutes` |
| `040_reports.sql` | Dev 5 | View `v_sales_lines` |
| `041_audit.js` | Dev 5 | `audit_log` table + programmatic audit triggers on 7 tables |

### 6.2 Core Tables (`001_core.sql`)

```
users
  id INT PK AI
  name VARCHAR(100)
  email VARCHAR(190) UNIQUE
  password_hash VARCHAR(255)
  role ENUM('ADMIN','FACTORY','STORE','CUSTOMER') DEFAULT 'CUSTOMER'
  phone, nic, address VARCHAR
  active BOOLEAN DEFAULT TRUE

sessions
  id CHAR(36) PK          ← UUID
  user_id INT → users
  last_seen DATETIME
  expires_at DATETIME
  revoked BOOLEAN

stores
  id INT PK AI
  city VARCHAR(60) UNIQUE
  location VARCHAR(255)
  manager_id INT UNIQUE → users

routes
  id INT PK AI
  store_id INT → stores
  name VARCHAR(80)
  coverage_area VARCHAR(120) UNIQUE
  max_minutes INT CHECK(1..480)
  active BOOLEAN
```

`app_lock` (single-row table, `id=1`) is used with `SELECT ... FOR UPDATE` in stored procedures to serialize concurrent writes.

### 6.3 Orders & Products (`010_orders.sql`)

```
products
  id INT PK AI
  name VARCHAR(100) UNIQUE
  unit_price DECIMAL(12,2) CHECK > 0
  space_rate DECIMAL(10,3) CHECK > 0    ← space units per item
  active BOOLEAN

orders
  id INT PK AI
  customer_id INT → users
  route_id INT → routes
  placed_at DATETIME DEFAULT NOW()
  delivery_date DATE
  address VARCHAR(255)
  instructions VARCHAR(500)
  status ENUM('PENDING','ALLOCATED','ON_TRAIN','PARTIAL_AT_STORE',
              'MISSING','AT_STORE','SCHEDULED','OUT_FOR_DELIVERY','DELIVERED')
  delivered_at DATETIME NULL
  INDEX: (customer_id,placed_at), (placed_at), (status,route_id)

order_items
  order_id INT → orders  ] composite PK
  product_id INT → products ]
  quantity INT CHECK(1..100000)
  unit_price DECIMAL(12,2)    ← snapshot at order time
  space_rate DECIMAL(10,3)    ← snapshot at order time
  line_total DECIMAL(16,2) GENERATED (quantity × unit_price) STORED

VIEW v_order_totals
  order_id, total_value, total_quantity, total_space
```

**Triggers**:
- `orders_lead_insert` / `orders_lead_update` — enforce minimum 7-day lead time on `delivery_date`.

### 6.4 Rail Allocation (`020_rail.sql`)

```
train_trips
  id INT PK AI
  reference VARCHAR(80) UNIQUE
  store_id INT → stores
  departure_at DATETIME
  arrival_at DATETIME CHECK > departure_at
  capacity DECIMAL(12,3)
  status ENUM('SCHEDULED','IN_TRANSIT','ARRIVED')
  INDEX: (store_id, departure_at)

train_allocations
  id INT PK AI
  train_trip_id INT → train_trips
  order_id + product_id → order_items  (FK composite)
  quantity INT CHECK > 0
  space_rate DECIMAL(10,3)
  space_used DECIMAL(16,3) GENERATED (quantity × space_rate) STORED
  received_qty INT DEFAULT 0 CHECK(0..quantity)
  receipt_checked BOOLEAN
  received_at DATETIME NULL
  UNIQUE(train_trip_id, order_id, product_id)

VIEW v_train_capacity
  All train_trips columns + available_capacity (capacity − sum(space_used))
```

**Triggers**:
- `allocation_guard` (BEFORE INSERT) — checks remaining order quantity, available train capacity, and that train destination matches order's route store.
- `allocation_immutable` (BEFORE UPDATE) — prevents changes to core fields; `received_qty` can only increase.
- `train_edit_guard` (BEFORE UPDATE) — prevents editing an allocated train's timetable or destination.

### 6.5 Road Delivery (`030_road.sql`)

```
trucks
  id INT PK AI
  store_id INT → stores
  plate VARCHAR(30) UNIQUE
  type VARCHAR(60)
  capacity DECIMAL(12,3)
  active BOOLEAN

employees
  id INT PK AI
  store_id INT → stores
  role ENUM('DRIVER','ASSISTANT')
  name, nic UNIQUE, phone, email
  active BOOLEAN

delivery_trips
  id INT PK AI
  route_id INT → routes
  truck_id INT → trucks
  driver_id INT → employees
  assistant_id INT → employees
  CHECK(driver_id <> assistant_id)
  planned_start / planned_end DATETIME
  actual_start / actual_end DATETIME NULL
  status ENUM('PLANNED','OUT','COMPLETED','CANCELLED')
  INDEX: (truck_id,planned_start), (driver_id,planned_start), (assistant_id,planned_start)

delivery_trip_orders
  trip_id INT → delivery_trips  ] composite PK
  order_id INT → orders         ]
  outcome ENUM('PENDING','DELIVERED','FAILED')

VIEW v_trip_windows    ← effective time windows per trip (actual or planned)
VIEW v_staff_windows   ← per-employee time windows for roster hour calculations
```

### 6.6 Audit Log (`041_audit.js`)

The audit migration is a **JavaScript migration** — it programmatically generates 21 AFTER INSERT/UPDATE/DELETE triggers (3 per table × 7 tables) plus 2 immutability guards on `audit_log` itself.

```
audit_log
  id BIGINT PK AI
  actor_id INT NULL     ← @actor session variable set by db.js
  changed_at DATETIME
  entity VARCHAR(40)    ← table name
  action VARCHAR(10)    ← INSERT / UPDATE / DELETE
  old_values JSON NULL
  new_values JSON NULL
  INDEX: (entity, changed_at)
```

Audited tables: `orders`, `order_items`, `train_trips`, `train_allocations`, `delivery_trips`, `delivery_trip_orders`, `employees`.

The `audit_no_update` and `audit_no_delete` triggers enforce append-only semantics — no row can ever be modified or removed.

---

## 7. Stored Procedures & Business Logic

All stored procedures use `SQL SECURITY DEFINER` and acquire the `app_lock` row with `SELECT ... FOR UPDATE` at the start of each transaction to serialize concurrent writes without deadlocks.

| Procedure | Called from | Summary |
|-----------|-------------|---------|
| `sp_place_order` | `orders.routes.js POST /orders` | Validates customer, route, date, items; snapshots prices; inserts order + items atomically. |
| `sp_refresh_order` | Internal (called by rail procs) | Recomputes an order's `status` field based on current allocation and receipt state. |
| `sp_allocate_order` | `rail.routes.js POST /rail/allocate` | Iterates eligible trains (cursor) and fills each product line greedily into available capacity across multiple trips. Rolls back entirely if full allocation is not achievable. |
| `sp_dispatch_train` | `rail.routes.js POST /trains/:id/dispatch` | Sets train to `IN_TRANSIT`; calls `sp_refresh_order` for each allocated order. |
| `sp_receive_allocation` | `rail.routes.js POST /rail/receive` | Records received quantity; marks train `ARRIVED` when all allocations on that trip are checked; calls `sp_refresh_order`. |
| `sp_schedule_delivery` | `road.routes.js POST /road/schedule` | Validates resources and time windows; creates `delivery_trips` + `delivery_trip_orders`; checks overlapping hours via `fn_work_minutes`. |
| `sp_dispatch_delivery` | `road.routes.js POST /road/trips/:id/dispatch` | Moves trip to `OUT`; sets `actual_start`; updates orders to `OUT_FOR_DELIVERY`. |
| `sp_cancel_delivery` | `road.routes.js POST /road/trips/:id/cancel` | Moves `PLANNED` trip to `CANCELLED`; returns orders to `AT_STORE`. |
| `sp_return_delivery` | `road.routes.js POST /road/trips/:id/return` | Records `actual_end`; marks delivered orders as `DELIVERED`; marks undelivered orders `FAILED` → returns them to `AT_STORE` for re-scheduling. |

**`fn_work_minutes(employee_id, week_start, include_planned)`** — a scalar function that sums the work-window duration for an employee over a week, used both in `sp_schedule_delivery` (to enforce weekly hour caps) and in the `/road/resources` endpoint (for the roster display).

---

## 8. Frontend Deep-Dive

The frontend is a **React 19 SPA** built with **Vite 7** and styled with **Tailwind CSS 4**.

### 8.1 Entry Point — [`main.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/main.jsx)

- Uses Vite's `import.meta.glob('./modules/*/Page.jsx', { eager: true })` to **auto-discover** all module pages at build time — same pattern as the backend's auto-loading of route files.
- Each `Page.jsx` must export three named values: `roles` (string array), `label` (nav tab text), `order` (sort number), and a `default` React component.
- At runtime, `App` filters discovered modules by `req.user.role` to build the navigation bar — only tabs the current user is authorized to see are rendered.
- Session token stored in `sessionStorage` (cleared on tab close, not persistent).
- A `signed-out` custom DOM event is dispatched when a 401 is received from any API call, resetting UI state globally.

### 8.2 API Client — [`api.js`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/api.js)

A thin `fetch` wrapper:
- Prepends `/api` to all paths.
- Reads the JWT from `sessionStorage` and adds the `Authorization: Bearer ...` header.
- Always sets `Content-Type: application/json` and JSON-serializes `options.body`.
- On any non-OK response, throws an `Error` with the API's `error` field as message.
- On `401` (except `/auth/login`): clears the token and fires `signed-out`.

### 8.3 Shared UI Components — [`components/UI.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/components/UI.jsx)

| Export | Purpose |
|--------|---------|
| `<Table rows={[]} />` | Renders any array of objects as a responsive table. Columns inferred from object keys. Highlights `MISSING` (red) and `DELIVERED` (teal) cells. |
| `<Form fields={[]} onSubmit button />` | Declarative form generator. Each field descriptor can specify `type`, `options` (for `<select>`), `optional`, `min`, `max`, `step`, `placeholder`. Handles loading state and displays API response messages. |
| `options(rows, label)` | Helper to convert an array of DB rows into `{value, label}` pairs for `<Form>` select fields. |
| `<Banner>` | Amber info callout block. |

### 8.4 Module Pages

Each page is the full UI for one domain. They follow a consistent pattern: fetch on mount, re-fetch after every mutation, use `<Table>` for read-only data, and `<Form>` for mutations.

| File | `label` | `order` | Roles | Key features |
|------|---------|---------|-------|-------------|
| [`core/Page.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/modules/core/Page.jsx) | Directory | (low) | ADMIN | User management, store-manager assignment, route creation/toggle |
| [`orders/Page.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/modules/orders/Page.jsx) | Orders | — | CUSTOMER, ADMIN, FACTORY, STORE | Place orders (customer), manage products (admin/factory), view orders |
| [`rail/Page.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/modules/rail/Page.jsx) | Rail | — | ADMIN, FACTORY, STORE | Schedule trains, allocate orders, dispatch, receive at store |
| [`road/Page.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/modules/road/Page.jsx) | Road | 40 | ADMIN, STORE | Fleet/staff management, plan trips, dispatch, log returns |
| [`reports/Page.jsx`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/frontend/src/modules/reports/Page.jsx) | Reports | — | ADMIN, FACTORY, CUSTOMER | Quarterly sales, product breakdown, location, hours, trucks, history, audit |

---

## 9. Role-Based Access Control (RBAC)

Four roles are defined in the `users.role` ENUM:

| Role | Who | Capabilities |
|------|-----|-------------|
| `ADMIN` | Platform administrator | Full access everywhere. User management, all reports, audit log. |
| `FACTORY` | Kandy factory staff | Manage products, trains, order allocation, dispatch. View reports. Cannot manage users or stores. |
| `STORE` | Regional store manager | View their own store's trains, receive allocations, manage road fleet and delivery trips for their store only. View their store's orders. |
| `CUSTOMER` | End customer | Place orders, view own orders and own history. No staff screens. |

RBAC is enforced at two levels:
1. **Backend**: `roles(...)` middleware and `checkStore()` in every route that needs it.
2. **Frontend**: The `allowed = modules.filter(m => m.roles.includes(user?.role))` filter in `main.jsx` hides entire page tabs from unauthorized users.

---

## 10. Order Lifecycle State Machine

```
         CUSTOMER places order
                │
           PENDING ──── sp_allocate_order ──► ALLOCATED
                                                    │
                                          sp_dispatch_train
                                                    │
                                               ON_TRAIN
                                                    │
                                          sp_receive_allocation
                                         ┌──────────┴──────────┐
                                    AT_STORE           PARTIAL_AT_STORE
                                    MISSING
                                         │
                                  sp_schedule_delivery
                                         │
                                     SCHEDULED
                                         │
                                  sp_dispatch_delivery
                                         │
                                  OUT_FOR_DELIVERY
                                         │
                                  sp_return_delivery
                                  ┌──────┴──────┐
                               DELIVERED     AT_STORE (re-scheduled)
```

The `sp_refresh_order` helper recomputes status after each rail event, ensuring status always reflects the current allocation/receipt reality.

---

## 11. Developer Scripts

Located in [`backend/scripts/`](file:///c:/Users/Kaveen/Documents/CSE/SEM_3/Database_Systems/KandyPack/kandypack-group23/backend/scripts/):

| Script | NPM command | Purpose |
|--------|-------------|---------|
| `migrate.js` | `npm run migrate` | Runs all pending migrations in order. Tracks applied migrations in a `schema_migrations` table. |
| `provision.js` | `npm run provision` | Creates the restricted `kp_app` MySQL user and grants minimal required privileges. Re-runnable. |
| `create-dev-admin.js` | (manual, run from `backend/`) | Creates a single `dev1-admin@kandypack.test` ADMIN account. Idempotent — stops without error if already exists. |
| `seed.js` | `npm run seed` | Inserts demo stores, routes, staff accounts, products, and sample orders. Controlled by `SEED_DEMO=YES` env variable. Fully operational. |
| `check.js` | `npm run check` | Syntax-checks all backend JS files using Node's `--check` flag. |
| `test.js` | `npm test` | Runs the integration test suite (21 passing suites) against an isolated test database. Fully operational. |
| `admin.js` | (utility) | Admin helper script. |
| `backup.ps1` | (manual) | PowerShell database backup script. |

---

## 12. NPM Workspaces & Scripts

The root `package.json` configures an **npm workspaces** monorepo with two members: `backend` and `frontend`. All commands are run from the project root.

| Command | What it does |
|---------|-------------|
| `npm ci` | Installs all dependencies for both workspaces |
| `npm run api` | Starts backend with `--watch` (hot-reload on file changes) |
| `npm run web` | Starts Vite dev server for frontend on port 5173 |
| `npm run build` | Builds the frontend production bundle to `frontend/dist/` |
| `npm run check` | Syntax-checks backend JS + builds frontend (CI gate) |
| `npm run migrate` | Runs DB migrations |
| `npm run provision` | Creates/updates the `kp_app` DB user |
| `npm run seed` | Seeds demo data (requires `SEED_DEMO=YES`) |
| `npm test` | Runs integration tests |

Node.js version: **`>=24 <25`** (enforced via `"engines"` field).

---

## 13. Environment Configuration

Two `.env` files are required (never committed; only the `.env.example` placeholders are tracked):

### Root `.env` (for Docker)
```
MYSQL_ROOT_PASSWORD=<strong-password>
```

### `backend/.env`
```
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=kandypack
DB_USER=kp_app
DB_PASSWORD=<12+ char app password>
DB_ADMIN_PASSWORD=<same as MYSQL_ROOT_PASSWORD>
JWT_SECRET=<64-char random hex>
SEED_DEMO=NO
DEMO_PASSWORD=<12+ char demo password>
PORT=3000
HOST=127.0.0.1
```

Key design decisions:
- **Two MySQL accounts**: `root` (admin, used only for migrations/provisioning) and `kp_app` (restricted, used by the running application).
- **JWT_SECRET** must be ≥32 characters and not start with `replace-` (enforced at startup).
- **SEED_DEMO=NO** prevents accidental data seeding in production.

---

## 14. Full Annotated File Tree

```
kandypack-group23/
│
├── .env                        ← Docker root password (gitignored)
├── .env.example                ← Placeholder template
├── .dockerignore
├── .gitignore
├── .github/                    ← CI/CD configuration
├── Dockerfile                  ← Production image (Node + built frontend)
├── compose.yaml                ← Docker Compose: db + app services
├── package.json                ← NPM workspaces root; top-level scripts
├── package-lock.json
├── extract.js                  ← Utility script (HTML doc extraction)
├── README.md                   ← Setup guide
│
├── docs/                       ← Internal developer notes
│   ├── architecture_report.md
│   ├── d2-orders-notes.md
│   ├── d3_notes.md
│   └── d4-road-notes.md
│
├── backend/
│   ├── .env                    ← Backend secrets (gitignored)
│   ├── .env.example            ← Template
│   ├── package.json            ← Backend deps: express, mysql2, bcryptjs, jsonwebtoken, dotenv
│   ├── out.log                 ← Dev log file
│   │
│   ├── src/                    ← Application source
│   │   ├── server.js           ← Express app bootstrap + auto-route-loading
│   │   ├── db.js               ← MySQL pool, read(), transaction(), call()
│   │   ├── auth.js             ← Register, login, authenticate middleware
│   │   ├── http.js             ← fail(), int(), text(), roles(), checkStore()
│   │   └── modules/            ← Feature route modules (auto-loaded)
│   │       ├── core.routes.js  ← Users, stores, routes
│   │       ├── orders.routes.js← Products, orders
│   │       ├── rail.routes.js  ← Trains, allocations, receipt
│   │       ├── road.routes.js  ← Trucks, employees, delivery trips
│   │       └── reports.routes.js← All reporting endpoints
│   │
│   ├── db/
│   │   └── migrations/         ← Ordered DB migrations
│   │       ├── 001_core.sql    ← users, sessions, stores, routes
│   │       ├── 010_orders.sql  ← products, orders, sp_place_order
│   │       ├── 020_rail.sql    ← train_trips, allocations, rail SPs
│   │       ├── 030_road.sql    ← trucks, employees, delivery_trips, road SPs
│   │       ├── 040_reports.sql ← v_sales_lines view
│   │       └── 041_audit.js    ← audit_log table + programmatic triggers
│   │
│   ├── scripts/                ← Dev/ops utilities
│   │   ├── migrate.js          ← Run pending migrations
│   │   ├── provision.js        ← Create kp_app DB user
│   │   ├── create-dev-admin.js ← Seed one admin account
│   │   ├── seed.js             ← Demo data seeder
│   │   ├── check.js            ← JS syntax checker
│   │   ├── test.js             ← Integration test runner
│   │   ├── admin.js            ← Admin helper
│   │   └── backup.ps1          ← PowerShell DB backup
│   │
│   └── test/                   ← Test files (structure TBD)
│
└── frontend/
    ├── index.html              ← Vite HTML entry point
    ├── vite.config.js          ← Vite config with React + Tailwind plugins
    ├── package.json            ← Frontend deps: react, react-dom, vite, tailwindcss
    │
    ├── dist/                   ← Built output (gitignored; served by Express in prod)
    │
    └── src/
        ├── main.jsx            ← App root: auth flow, nav, module auto-discovery
        ├── api.js              ← fetch wrapper with JWT + 401 handling
        ├── style.css           ← Global CSS (Tailwind imports + base styles)
        │
        ├── components/
        │   └── UI.jsx          ← Table, Form, Banner, options()
        │
        └── modules/            ← Feature pages (auto-discovered by main.jsx)
            ├── core/
            │   └── Page.jsx    ← Admin: users, stores, routes
            ├── orders/
            │   └── Page.jsx    ← Products + order placement/viewing
            ├── rail/
            │   └── Page.jsx    ← Train management and allocation
            ├── road/
            │   └── Page.jsx    ← Fleet, staff, delivery planning
            └── reports/
                └── Page.jsx    ← All reports + audit
```

---

> **Last updated**: October 2026 · Based on current source as of the Dev1–Dev4 foundation.
