# KandyPack — End-to-End Order Lifecycle Checklist & Specification

This document provides the authoritative step-by-step specification for tracing an order through the complete two-leg supply chain in KandyPack: from initial customer checkout to regional train transit, depot receiving, road delivery dispatch, and customer completion.

---

## Order State Machine Overview

```
[CUSTOMER]
   │
   ▼
[ 1. PENDING ] ────────► Placed ≥ 7 days in advance; items and prices snapshotted.
   │
   │ sp_allocate_order (Leg 1: Rail Allocation)
   ▼
[ 2. ALLOCATED ] ──────► Assigned to one or more scheduled train trips with sufficient capacity.
   │
   │ sp_dispatch_train
   ▼
[ 3. ON_TRAIN ] ───────► Train trip departs Kandy factory (train status: IN_TRANSIT).
   │
   │ sp_receive_allocation (Leg 1 Completion)
   ▼
[ 4. AT_STORE ] ───────► Arrived and physically checked into the regional store depot.
   │                     (Alternative states: PARTIAL_AT_STORE or MISSING if cargo was short).
   │
   │ sp_schedule_delivery (Leg 2: Road Rostering)
   ▼
[ 5. SCHEDULED ] ──────► Grouped into a planned delivery trip with assigned truck, driver, assistant.
   │
   │ sp_dispatch_delivery
   ▼
[ 6. OUT_FOR_DELIVERY ] ► Delivery truck departs depot (trip status: OUT).
   │
   │ sp_return_delivery (Leg 2 Completion)
   ├──────────────────────────────┬──────────────────────────────┐
   ▼                              ▼                              ▼
[ 7. DELIVERED ]          [ FAILED RETRY ]                [ CANCELLED ]
Delivered to customer;    Undelivered orders marked       Planned trip cancelled;
delivered_at recorded.    FAILED and returned to AT_STORE orders return to AT_STORE.
```

---

## Detailed Step-by-Step API Specification

### Step 1: Place Customer Order
* **Acting Role:** `CUSTOMER`
* **HTTP Endpoint:** `POST /api/orders`
* **Stored Procedure:** `sp_place_order(customer_id, route_id, address, instructions, delivery_date, items_json)`
* **Sample Request Payload:**
  ```json
  {
    "route_id": 1,
    "address": "123 Peradeniya Road, Kandy",
    "delivery_date": "2026-10-25",
    "items": [
      { "product_id": 1, "quantity": 10 },
      { "product_id": 2, "quantity": 5 }
    ]
  }
  ```
* **Expected Response:** `201 Created`
  ```json
  { "id": 101, "message": "Order placed" }
  ```
* **Database State Mutations:**
  - Row created in `orders` with `status = 'PENDING'`.
  - Rows created in `order_items` with current unit price and space rate snapshotted from `products`.
  - `audit_log` records `INSERT` on `orders` and `order_items` with `actor_id = req.user.id`.
* **Validation Guards:**
  - `delivery_date` must be at least 7 days from `CURRENT_DATE` (enforced by DB trigger).
  - Quantities must be positive integers (`1..100000`).

---

### Step 2: Schedule Train & Allocate Order
* **Acting Role:** `FACTORY` or `ADMIN`
* **HTTP Endpoints:**
  1. `POST /api/trains` (Create Train Trip)
  2. `POST /api/rail/allocate` (Allocate Order)
* **Stored Procedure:** `sp_allocate_order(order_id, train_trip_id)`
* **Sample Request Payload (Allocate):**
  ```json
  {
    "order_id": 101,
    "train_trip_id": 5
  }
  ```
* **Expected Response:** `200 OK`
  ```json
  { "allocated_order_id": 101, "status": "ALLOCATED" }
  ```
* **Database State Mutations:**
  - Rows created in `train_allocations` referencing `order_id`, `product_id`, and `train_trip_id`.
  - `orders.status` transitions from `PENDING` to `ALLOCATED`.
  - Train available capacity decreases in `v_train_capacity`.
  - `audit_log` records `INSERT` on `train_allocations` and `UPDATE` on `orders`.
* **Validation Guards:**
  - Train destination `store_id` must match the order route's `store_id`.
  - Train must have sufficient remaining available capacity.

---

### Step 3: Dispatch Train
* **Acting Role:** `FACTORY` or `ADMIN`
* **HTTP Endpoint:** `POST /api/trains/:id/dispatch`
* **Stored Procedure:** `sp_dispatch_train(train_trip_id)`
* **Sample Request Payload:** `{}`
* **Expected Response:** `200 OK`
  ```json
  { "train_trip_id": 5, "status": "IN_TRANSIT" }
  ```
* **Database State Mutations:**
  - `train_trips.status` transitions from `SCHEDULED` to `IN_TRANSIT`.
  - `sp_refresh_order` sets all allocated `orders.status` to `ON_TRAIN`.
  - `audit_log` records `UPDATE` on `train_trips` and `orders`.

---

### Step 4: Receive Goods at Regional Store Depot
* **Acting Role:** `STORE` (for that store) or `ADMIN`
* **HTTP Endpoint:** `POST /api/rail/receive`
* **Stored Procedure:** `sp_receive_allocation(allocation_id, store_id, received_qty)`
* **Sample Request Payload:**
  ```json
  {
    "allocation_id": 42,
    "received_qty": 10
  }
  ```
* **Expected Response:** `200 OK`
  ```json
  { "allocation_id": 42, "order_status": "AT_STORE" }
  ```
* **Database State Mutations:**
  - `train_allocations.received_qty` set, `receipt_checked = 1`, `received_at = NOW()`.
  - Once all allocations for that trip are checked, `train_trips.status` becomes `ARRIVED`.
  - If received quantity equals ordered quantity: `orders.status` becomes `AT_STORE`.
  - If partial quantity received: `orders.status` becomes `PARTIAL_AT_STORE`.
  - If zero quantity received: `orders.status` becomes `MISSING`.
  - `audit_log` records `UPDATE` on `train_allocations` and `orders`.

---

### Step 5: Schedule Road Delivery Trip
* **Acting Role:** `STORE` (for that store) or `ADMIN`
* **HTTP Endpoint:** `POST /api/road/schedule`
* **Stored Procedure:** `sp_schedule_delivery(route_id, truck_id, driver_id, assistant_id, planned_start, planned_end, order_ids_json)`
* **Sample Request Payload:**
  ```json
  {
    "route_id": 1,
    "truck_id": 3,
    "driver_id": 12,
    "assistant_id": 14,
    "planned_start": "2026-10-25 09:00:00",
    "planned_end": "2026-10-25 12:00:00",
    "order_ids": [101]
  }
  ```
* **Expected Response:** `201 Created`
  ```json
  { "id": 18, "message": "Delivery trip scheduled" }
  ```
* **Database State Mutations:**
  - Row created in `delivery_trips` with `status = 'PLANNED'`.
  - Rows created in `delivery_trip_orders` with `outcome = 'PENDING'`.
  - `orders.status` transitions from `AT_STORE` to `SCHEDULED`.
  - `audit_log` records `INSERT` on `delivery_trips` and `UPDATE` on `orders`.
* **Validation Guards:**
  - Driver and Assistant cannot be the same person.
  - Driver cannot exceed 40 hours/week; Assistant cannot exceed 60 hours/week (computed by `fn_work_minutes`).
  - Truck and employees must not have overlapping trips.

---

### Step 6: Dispatch Road Delivery Trip
* **Acting Role:** `STORE` (for that store) or `ADMIN`
* **HTTP Endpoint:** `POST /api/road/trips/:id/dispatch`
* **Stored Procedure:** `sp_dispatch_delivery(trip_id)`
* **Sample Request Payload:** `{}`
* **Expected Response:** `200 OK`
  ```json
  { "trip_id": 18, "status": "OUT" }
  ```
* **Database State Mutations:**
  - `delivery_trips.status` becomes `'OUT'`, `actual_start = NOW()`.
  - `orders.status` transitions to `'OUT_FOR_DELIVERY'`.
  - `audit_log` records `UPDATE` on `delivery_trips` and `orders`.

---

### Step 7: Log Delivery Trip Return & Outcomes
* **Acting Role:** `STORE` (for that store) or `ADMIN`
* **HTTP Endpoint:** `POST /api/road/trips/:id/return`
* **Stored Procedure:** `sp_return_delivery(trip_id, actual_end, delivered_ids_json)`
* **Sample Request Payload:**
  ```json
  {
    "actual_end": "2026-10-25 12:15:00",
    "delivered_ids": [101]
  }
  ```
* **Expected Response:** `200 OK`
  ```json
  { "trip_id": 18, "status": "COMPLETED" }
  ```
* **Database State Mutations:**
  - `delivery_trips.status` becomes `'COMPLETED'`, `actual_end` recorded.
  - **Successful Delivery:** Orders in `delivered_ids` have `outcome = 'DELIVERED'`, `orders.status = 'DELIVERED'`, and `delivered_at = actual_end`.
  - **Failed Delivery:** Orders NOT in `delivered_ids` have `outcome = 'FAILED'`, and their `orders.status` automatically reverts back to `'AT_STORE'` so the store can re-schedule them on a subsequent delivery trip.
  - `audit_log` records `UPDATE` on `delivery_trips`, `delivery_trip_orders`, and `orders`.

---

## Verification & Audit Query Reference

To verify that the audit trail has captured the complete sequence of actors:
```sql
SELECT 
    a.id, 
    a.changed_at, 
    a.entity, 
    a.action, 
    u.name AS actor_name, 
    u.role AS actor_role
FROM audit_log a
LEFT JOIN users u ON u.id = a.actor_id
WHERE a.entity IN ('orders', 'order_items', 'train_allocations', 'delivery_trips')
ORDER BY a.id DESC
LIMIT 25;
```
