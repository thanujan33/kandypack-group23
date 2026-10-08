# Developer 3 - Rail Module Verification Notes

## Concurrency & Locking
- Uses `SELECT id FROM app_lock WHERE id=1 FOR UPDATE` within `sp_allocate_order` to serialize concurrent allocation requests and avoid overselling train space.
- Complete rollback occurs if any portion of an order exceeds the eligible capacity.

## Handoff Boundaries
- Road scheduling (D4) only targets orders with `status = 'AT_STORE'`.
- Sales reporting (D5) references `order_items` directly rather than multiplying rows across split allocations.