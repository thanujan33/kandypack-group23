# KandyPack — Development & Execution Activity Log

**Branch:** `demo-dev`  
**Tracking Started:** October 10, 2026  
**Objective:** Track all architectural, backend, frontend, schema, and documentation modifications during the integration and hardening phase.

---

## Log Entries

### Entry 001 — Baseline Synchronization & Step 1 Execution
- **Date & Time:** 2026-10-10 15:48 IST
- **Target Step:** Step 1 (Reproducible Environment & Documentation Alignment)
- **Git Commit:** `16c81eb` (`docs: modernize setup guide and synchronize environment configuration`)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Prior to this step, the repository `README.md` was outdated and reflected only the Dev 1 initial foundation. It claimed feature modules 2–5 and automated tests were missing, warning developers not to run `npm test` or `npm run seed`. In reality, all feature domains (Orders, Rail, Road, Reports) have already been merged into `main`, and an automated test suite with 14 test cases is in place.

#### Changes Made
1. **Branch Management:**
   - Pulled latest upstream updates from `origin/main` (Fast-forwarded with commits updating `orders.routes.js` and `api.test.js`).
   - Created working branch `demo-dev`.
2. **Environment Synchronization:**
   - Verified alignment between `.env` (root) and `backend/.env` (DB port `3307`, user `kp_app`, admin `root`, demo password `abcdef123456`).
3. **Documentation Overhaul (`README.md`):**
   - Replaced outdated status notes with an up-to-date domain responsibility matrix (Dev 1 through Dev 5).
   - Documented the verified 7-step setup flow:
     - `npm ci`
     - `docker compose up -d db`
     - `npm run migrate`
     - `npm run provision`
     - `node backend/scripts/create-dev-admin.js`
     - Verification: `npm run check` & `npm test`
     - Launch: `npm run api` & `npm run web`
   - Documented default administrative credentials: `dev1-admin@kandypack.test` / `abcdef123456`.
   - Documented all top-level npm workspace scripts.

#### Verification & Test Results
- **Syntax & Bundle Verification:** `npm run check` completed with code 0 (both Node syntax check and Vite 7 production bundle build succeeded).
- **Integration Test Suite:** `npm test` passed 14/14 tests in 13.2s on a clean, isolated database fixture.
- **Admin Setup Script:** Executed `node backend/scripts/create-dev-admin.js` successfully, provisioning the local administrator test account.

---

### Entry 002 — Step 2 Execution: Seed Fixtures Audit & Test Coverage Expansion
- **Date & Time:** 2026-10-10 15:57 IST
- **Target Step:** Step 2 (Seed Data & Expanded Integration Testing)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 2 required verifying that `seed.js` fixtures correctly populate stores, routes, trucks, staff, products, and multi-stage orders, and ensuring comprehensive test coverage across Role-Based Access Control (RBAC) and store multi-tenancy boundaries. Furthermore, previous documentation marked `seed.js` and `test.js` as "not ready in current foundation", which needed synchronization.

#### Changes Made
1. **Test Suite Expansion (`backend/test/api.test.js`):**
   - Added test `role-based access control guards unauthorized mutations`:
     - Verifies non-admin accounts receive `403 Forbidden` when attempting to create staff (`POST /staff-users`).
     - Verifies customer accounts receive `403 Forbidden` when attempting to create products (`POST /products`).
     - Verifies customer accounts receive `403 Forbidden` when attempting to create delivery routes (`POST /routes`).
     - Verifies customer and factory accounts receive `403 Forbidden` when attempting to access store road fleet resources (`GET /road/resources`).
   - Added test `store managers are strictly isolated to their own store resources`:
     - Verifies that when a store manager requests `/road/resources`, the query strictly scopes returned trucks and employees to the manager's assigned store (`store_id`), preventing cross-store data leakage.
2. **Architecture Documentation Synchronized (`docs/kandypack_architecture.md`):**
   - Updated table entries for `seed.js` and `test.js` from "Not ready in current foundation" to "Fully operational (21 passing test suites)".

#### Verification & Test Results
- **Test Suite Execution:** Ran `npm test`. All 21 tests passed (0 failures, duration 18.4s) on an isolated temporary MySQL database.

---

### Entry 003 — Step 3 Execution: End-to-End Order Lifecycle Specification & Automated Testing
- **Date & Time:** 2026-10-10 16:08 IST
- **Target Step:** Step 3 (E2E Lifecycle Walkthrough & Verification)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 3 required establishing an authoritative end-to-end specification for the two-leg distribution supply chain (`PENDING` -> `ALLOCATED` -> `ON_TRAIN` -> `AT_STORE` -> `SCHEDULED` -> `OUT_FOR_DELIVERY` -> `DELIVERED` and `FAILED` retry) and building an automated integration test exercising this exact sequence across multiple user roles (`CUSTOMER`, `FACTORY`, `STORE`) and verifying the audit trail (`audit_log`).

#### Changes Made
1. **Authoritative Specification Created (`docs/e2e-checklist.md`):**
   - Detailed specification for each of the 7 lifecycle state transitions.
   - For every step, documented: acting role, endpoint, stored procedure invoked, sample request payload, response status, database mutations, validation guards, and audit trail records.
   - Documented the failed delivery recovery branch (`FAILED` outcome -> order returns to `AT_STORE` for re-scheduling).
2. **Automated Lifecycle Test Suite Built (`backend/test/lifecycle.test.js`):**
   - Implemented `end-to-end order lifecycle through all 7 states with audit verification`:
     - Creates order via `POST /api/orders` by customer -> asserts `PENDING`.
     - Schedules train trip and allocates order via `POST /api/rail/allocate` by factory -> asserts `ALLOCATED`.
     - Dispatches train via `POST /api/trains/:id/dispatch` -> asserts `ON_TRAIN` and train `IN_TRANSIT`.
     - Receives train cargo at depot via `POST /api/rail/receive` by store manager -> asserts `AT_STORE`.
     - Schedules delivery trip via `POST /api/road/schedule` -> asserts `SCHEDULED` and trip `PLANNED`.
     - Dispatches road delivery via `POST /api/road/trips/:id/dispatch` -> asserts `OUT_FOR_DELIVERY` and trip `OUT`.
     - Logs trip return via `POST /api/road/trips/:id/return` -> asserts `DELIVERED` and `delivered_at` set.
     - Verifies `audit_log` records actions with appropriate `actor_id` values.
   - Implemented `failed delivery returns order outcome to FAILED and status to AT_STORE for re-scheduling`:
     - Schedules delivery for an order at `AT_STORE`, dispatches trip, and returns with empty delivered list.
     - Asserts order reverts to `AT_STORE` and `delivery_trip_orders.outcome` is `FAILED`.

#### Verification & Test Results
- **Test Suite Execution:** Ran `npm test`. All 23 integration tests passed (0 failures, duration 17.8s) against an isolated temporary MySQL test database.

---

### Entry 004 — Step 4 Execution: Order Cancellation, Pagination, and Schema Expansion
- **Date & Time:** 2026-10-10 17:03 IST
- **Target Step:** Step 4 (Closing Known Gaps: Order Cancellation, Multi-Train Verification, and Pagination)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 4 resolved several essential functional and scalability gaps:
1. Customers lacked the ability to cancel an order, and the `orders.status` ENUM lacked a `CANCELLED` state.
2. List queries on `/orders` and `/rail/manifest` were unbounded, presenting scalability bottlenecks under high data volume.
3. Multi-train allocation spillover needed explicit verification and architectural alignment.
4. Cross-platform Git line-ending discrepancies on Windows caused false-positive migration checksum mismatches in `migrate.js`.

#### Changes Made
1. **New Migration Created & Applied (`backend/db/migrations/050_order_cancellation.sql`):**
   - Modified `orders.status` ENUM to append `'CANCELLED'`.
   - Created stored procedure `sp_cancel_order(p_order, p_user, p_role)`:
     - Enforces row locking with `app_lock` and `SELECT ... FOR UPDATE`.
     - Validates order ownership (only owner or ADMIN can cancel).
     - Validates order status is strictly `'PENDING'` (cannot cancel allocated or shipped orders).
     - Transitions status to `'CANCELLED'`, automatically triggering audit trail logging.
2. **Migration Runner Hardened (`backend/scripts/migrate.js`):**
   - Updated checksum verification to accept normalized LF or CRLF checksums, preventing platform-specific checkout mismatches on Windows.
3. **Backend API Endpoints Updated:**
   - Added `POST /api/orders/:id/cancel` in `orders.routes.js` protected with `roles('CUSTOMER', 'ADMIN')`.
   - Added query pagination (`?limit=` and `?offset=`) to `GET /api/orders` (capped at 200).
   - Added query pagination (`?limit=` and `?offset=`) to `GET /api/rail/manifest` (capped at 200).
4. **Frontend Integration (`frontend/src/modules/orders/Page.jsx`):**
   - Added "Cancel a pending order" form in Customer view allowing one-click cancellation of pending orders.
   - Added "Cancel Order" button in the Order Inspection drawer for pending orders.
5. **Automated Test Coverage Expanded (`backend/test/api.test.js`):**
   - Added tests verifying customer pending order cancellation, unauthorized cancel rejection, repeated cancel rejection, and robust `try/finally` test fixture cleanup.
   - Added tests verifying pagination limits and offset slicing across `/orders` and `/rail/manifest`.

#### Verification & Test Results
- **Syntax & Bundle Verification:** `npm run check` passed with code 0 (Vite 7 frontend production build succeeded).
- **Test Suite Execution:** `npm test` passed 25/25 integration tests (0 failures, duration 32.3s) across an isolated test database.

---

### Entry 005 — Step 5 Execution: Security Audit, Hardening, and Validation Rigor
- **Date & Time:** 2026-10-10 17:15 IST
- **Target Step:** Step 5 (Security Audit & Production-Readiness Hardening)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 5 focuses on hardening system resilience, validating untrusted user inputs, preventing SQL and privilege escalation vulnerabilities, and ensuring clean operational security:
1. Railway scheduling and road trip dispatch accept datetime strings that bypassed strict calendar verification (allowing invalid calendar dates like Feb 30 or malformed ISO formats).
2. The `kp_app` database user provisioning script (`scripts/provision.js`) required explicit execution permissions for newly added stored procedures (`sp_cancel_order`).
3. Form validation failure notifications in the frontend were presented in low-contrast text without accessibility `role="alert"` semantics.
4. Repository history and working trees required audit for committed secrets or temporary log artifacts.

#### Changes Made
1. **Timestamp Validator Implemented (`backend/src/http.js`):**
   - Added `datetime(value, name)` validator requiring strict format `YYYY-MM-DD HH:MM:SS`.
   - Performs two-step validation: regex format check followed by UTC `Date` parsing and ISO reconstruction check to guarantee calendar validity (e.g., rejects `2026-02-30 08:00:00`, `2025-02-29`, month `13`).
2. **Route Input Hardening:**
   - In `backend/src/modules/rail.routes.js`: Applied `datetime()` to `departure_at` and `arrival_at` on `POST /api/trains`.
   - In `backend/src/modules/road.routes.js`: Applied `datetime()` to `planned_start` and `planned_end` on `POST /api/road/schedule` and `actual_end` on `POST /api/road/trips/:id/return`.
3. **Least-Privilege Database Grants Provisioning (`backend/scripts/provision.js`):**
   - Added `sp_cancel_order` to the explicit `GRANT EXECUTE` list for `'kp_app'@'%'`.
   - Successfully executed `npm run provision`.
4. **Secrets and Repository Integrity Audit:**
   - Audited `.gitignore` and Git commit log. Verified zero committed `.env` secrets or runtime log dumps (`out.log`).
5. **Frontend Accessible Error Alert Styling (`frontend/src/components/UI.jsx`):**
   - Upgraded generic form feedback to track `isError` status.
   - On submission failure, displays an accessible, high-contrast red alert box (`role="alert"`, `bg-red-50 text-red-700 border-red-200`) instead of subtle status text.
6. **Automated Test Coverage Expanded (`backend/test/api.test.js`):**
   - Added `datetime validator rejects malformed timestamps and impossible calendar dates` test verifying rejection of malformed strings, ISO timestamps, and invalid calendar dates (e.g. Feb 30, non-leap Feb 29, month 13) with HTTP 400.

#### Verification & Test Results
- **Syntax & Lint Checks:** `npm run check` passed with code 0.
- **Frontend Production Build:** `npm run build` compiled 36 modules cleanly via Vite 7.
- **Full Backend Test Suite:** `npm test` passed 26/26 tests (0 failures, duration 22.1s).

---

### Entry 006 — Step 6 Execution: Frontend Polish, Stitch Logistics Design System & Stepper UX
- **Date & Time:** 2026-10-10 17:36 IST
- **Target Step:** Step 6 (Frontend Polish & Presentation Readiness)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 6 aligns the user interface with the instrument-grade Precision Logistics Grid aesthetic extracted from the Google Stitch workspace (`projects/3355781657758890071`). The redesign transforms the raw student UI into an intuitive, high-density logistics cockpit while strictly preserving all database-centric business logic, role guards, and endpoints:
1. Replaced plain text statuses with accessible, color-coded `<StatusBadge>` pill chips with animated pulse beacons for active transit states.
2. Implemented a 7-stage visual order lifecycle timeline stepper (`<Stepper>`) inside the Order Inspection drawer.
3. Replaced raw number input fields across modules with contextual selection dropdowns populated via `options()` (orders inspection, truck availability, employee availability).
4. Provided automated datetime-local normalization in `<Form>` ensuring HTML datepickers convert seamlessly to `YYYY-MM-DD HH:MM:SS` without validation errors.
5. Upgraded `<Table>` with tabular numeric figures, currency formatting, and client-side pagination controls.
6. Overhauled application navigation, header telemetry, and report visualization charts.

#### Changes Made
1. **Google Stitch Design Tokens & Fonts (`index.html` & `src/style.css`):**
   - Linked Google Fonts for `Geist` (sans) and `JetBrains Mono` (tabular and code numerals) and `Material Symbols Outlined`.
   - Styled canvas with `#F8FAFC` slate background, crisp `#E2E8F0` structural outlines, hover highlights, and instrument-panel cards.
2. **Design System Component Suite (`frontend/src/components/UI.jsx`):**
   - `<StatusBadge status>`: Color-coded status pills with pulsing indicators for `PENDING`, `ALLOCATED`, `ON_TRAIN`, `AT_STORE`, `SCHEDULED`, `OUT_FOR_DELIVERY`, `DELIVERED`, and `CANCELLED`.
   - `<Stepper currentStatus>`: 7-milestone visual progress timeline with completed checkmarks, active ring highlights, and cancelled alert banner.
   - `<StatCard>`: High-density KPI cards for dashboard metrics.
   - `<Table>`: Automatic badge rendering for status columns, monospace styling for IDs/codes, currency formatting, and responsive pagination controls.
   - `<Form>`: Auto-normalizes HTML `datetime-local` input values (`YYYY-MM-DDTHH:MM` -> `YYYY-MM-DD HH:MM:SS`) to prevent server rejection.
3. **Application Shell (`frontend/src/main.jsx`):**
   - Added sticky top navigation header with "KandyPack Logistics OS" branding, live intermodal status beacon ("Rail & Road Live"), user role badge, and clean sign-out action.
   - Replaced plain button tab bar with sleek segmented control buttons featuring Material icons.
4. **Order Management Module (`frontend/src/modules/orders/Page.jsx`):**
   - Added KPI cards for total, pending, in-transit, and delivered orders.
   - Replaced free-text order ID inspection input with a descriptive dropdown of recent orders.
   - Integrated `<Stepper>` in the Order Inspection drawer alongside consignment overview metadata and cargo line items table.
5. **Rail Capacity Module (`frontend/src/modules/rail/Page.jsx`):**
   - Added KPI cards for active trains, scheduled due trips, mainline transits, and manifest allocations.
   - Prefilled form fields when editing an existing scheduled train trip.
6. **Road Fleet & Rostering Module (`frontend/src/modules/road/Page.jsx`):**
   - Added fleet KPI metrics (trucks, drivers, assistants, trips).
   - Replaced raw number inputs for truck and staff availability toggles with direct dropdowns displaying plates, names, roles, and current statuses.
7. **Directory & Reports Modules (`core/Page.jsx` & `reports/Page.jsx`):**
   - Added directory KPI cards and streamlined multi-column administrative cards.
   - Enhanced reporting with segmented pill selectors, gradient SVG bar charts, CSV export, and print-to-PDF actions.

#### Verification & Test Results
- **Frontend Production Build:** `npm run build` compiled 36 modules cleanly via Vite 7 in 1.92s.
- **Backend Syntax Check:** `npm run check` passed with code 0.
- **Full Backend Test Suite:** `npm test` passed 26/26 tests (0 failures, duration 19.5s).

---

### Entry 007 — Step 7 Execution: Database Course Deliverables & Architectural Specifications
- **Date & Time:** 2026-10-10 17:56 IST
- **Target Step:** Step 7 (Database Course Deliverables & Architectural Documentation)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 7 creates the academic database deliverables and formal architectural specifications for evaluation:
1. Complete Entity-Relationship modeling across all 14 physical tables.
2. Academic normalization evaluation (1NF through BCNF) and justification for intentional point-in-time pricing and packaging snapshots in `order_items`.
3. Procedural SQL catalog covering 10 stored procedures, 1 stored function, 8 core triggers + dynamic audit triggers, and 6 views.
4. Concurrency control analysis detailing the pessimistic row-locking serialization table `app_lock` under `READ COMMITTED` and greedy cursor loops.
5. Analytical queries documentation for all 7 reporting endpoints with sample output fixtures.
6. Real-world disaster recovery and backup verification testing against an isolated scratch database (`kandypack_scratch_restore`).

#### Changes Made
1. **Entity-Relationship Specification Created (`docs/er-diagram.md`):**
   - Authored complete Mermaid `erDiagram` with all 14 tables, column types, PKs, FKs, and cardinalities.
   - Authored Data Dictionary and Foreign Key reference matrix with referential actions (`RESTRICT`, `CASCADE`).
2. **Database Design & Stored Logic Document Created (`docs/db-design.md`):**
   - Documented academic normalization analysis (1NF, 2NF, 3NF, BCNF) for all relations.
   - Documented rationale for immutable pricing snapshots in `order_items` (`unit_price`, `space_rate`, and generated `line_total`).
   - Cataloged all stored routines with parameters, files, tables touched, and locking characteristics.
   - Detailed pessimistic serialization via `app_lock` (`SELECT ... FOR UPDATE`), transaction isolation under `READ COMMITTED`, and cursor-based bin packing.
   - Documented security audit trail architecture (`@actor` propagation and append-only trigger enforcement).
3. **Analytics & Reporting Query Reference Created (`docs/reports.md`):**
   - Documented all 7 analytics endpoints with parameters, underlying SQL statements, business interpretations, and sample JSON outputs.
4. **Backup & Disaster Recovery Guide & Verification (`docs/backup-restore.md` & `backend/scripts/verify-restore.js`):**
   - Executed `backend/scripts/backup.ps1` generating `backups/kandypack-20261010-175040.sql` (105,252 bytes).
   - Created scratch database `kandypack_scratch_restore` in MySQL 8.4 container and restored backup dump.
   - Executed `verify-restore.js` verifying 100% row count parity across all 14 tables, 12 routines, and 30 triggers.
   - Safely purged scratch database following verification.

#### Verification & Test Results
- **Backend Syntax Check:** `npm run check` passed with code 0.
- **Disaster Recovery Simulation:** 100% parity across all 14 tables, 12 routines, and 30 triggers between source and restored database.
- **Backend Test Suite:** `npm test` passed 26/26 tests (0 failures).

---

### Entry 008 — Step 8 Execution: Release Preparation, Demo Walkthrough, and Viva Defense Documentation
- **Date & Time:** 2026-10-10 18:05 IST
- **Target Step:** Step 8 (Release & Demo Readiness)
- **Author/Agent:** Antigravity AI Assistant

#### Context & Rationale
Step 8 is the final phase of the project playbook. It validates the complete solution for production deployment, presentation, and academic defense:
1. Full test suite verification across all unit, integration, RBAC, and lifecycle tests.
2. Production container verification (`docker compose --profile full build`).
3. Authoring of a step-by-step academic demonstration walkthrough script (`docs/demo-script.md`) for 4 key user personas (Customer, Factory Manager, Store Manager, System Administrator).
4. Authoring of the Database Viva / Oral Examination technical defense guide covering query optimization, BCNF normalization, concurrency control (`app_lock`), and audit integrity.
5. Preparing release tags and PR guidance for repository merge.

#### Changes Made
1. **Academic Demo Script & Oral Exam Defense Guide Created (`docs/demo-script.md`):**
   - Scene-by-scene presentation roadmap covering 5 act phases:
     - Act 1: Customer Order Placement & Real-time Validation (Capacity constraints & point-in-time pricing snapshot).
     - Act 2: Order Cancellation & Immediate Wagon Capacity Release (Rollback & inventory restoration).
     - Act 3: Factory Rail Manifest Generation & Greedy Bin-Packing Algorithm (`sp_allocate_rail_capacity`).
     - Act 4: Road Final-Mile Delivery, Failed Delivery Retry Loop, and Auto-Completion.
     - Act 5: Executive Analytics Dashboard (Top products, delivery times, store distribution).
   - Persona-based switch matrix detailing credentials and specific responsibilities.
   - Comprehensive Oral Defense Q&A covering the top 7 technical viva questions:
     - Concurrency & Deadlock Prevention (`app_lock` vs table locks).
     - Normalization & Snapshot Strategy (1NF-BCNF vs `order_items` immutable fields).
     - Trigger Invariants & Security (`audit_log` append-only enforcement).
     - Cursor Performance in Stored Procedures (`sp_allocate_rail_capacity` linear scan).
     - State Machine Lifecycle Validation (Guarded transitions via check constraints).
     - Role-Based Access Control Isolation (`kp_app` vs `kp_read`).
     - Disaster Recovery & Backup Integrity Verification (Row and routine parity checks).
2. **Containerized Build Verification:**
   - Ran `docker compose --profile full build` to confirm multi-stage container images build cleanly for full offline deployment.

#### Verification & Test Results
- **Backend Lint & Syntax:** `npm run check` passed cleanly (code 0).
- **Backend Test Suite:** `npm test` passed 26/26 tests across all test suites (`api.test.js`, `lifecycle.test.js`, `unit.test.js`) in 20.1s.
- **Frontend Production Build:** `npm run build` compiled 36 modules cleanly in 1.92s.
- **Git State:** All documentation and code changes tracked on branch `demo-dev`.

---



