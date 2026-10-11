# Developer 4 - Road Delivery Acceptance Notes

## Owned area

Developer 4 owns the road delivery and staff roster module.

Main database objects:

- trucks
- employees
- delivery_trips
- delivery_trip_orders
- v_trip_windows
- fn_work_minutes
- roster validation procedure
- road scheduling triggers
- delivery lifecycle procedures

Backend:

- backend/src/modules/road.routes.js

Frontend:

- frontend/src/modules/road/Page.jsx

## Road scheduling rules

The database validates the following rules:

1. The truck must belong to the same store as the route.
2. The driver must belong to the same store and have role DRIVER.
3. The assistant must belong to the same store and have role ASSISTANT.
4. Trucks, drivers and assistants cannot be booked in overlapping trips.
5. A driver requires at least a 30 minute break between trips.
6. An assistant can perform at most two consecutive routes without a 30 minute break.
7. Driver weekly working limit is 40 hours.
8. Assistant weekly working limit is 60 hours.
9. The week starts on Monday.
10. Planned trip duration cannot exceed the route maximum.
11. Only AT_STORE orders may be scheduled for road delivery.
12. Orders must belong to the selected route.
13. Duplicate order IDs are rejected.
14. Total selected order space cannot exceed truck capacity.

## Boundary cases

The following are valid boundary cases:

- Driver exactly at 40 committed hours.
- Assistant exactly at 60 committed hours.
- A break of exactly 30 minutes.

The following must be rejected:

- Driver above 40 hours.
- Assistant above 60 hours.
- Less than 30 minutes driver rest.
- Third consecutive assistant route without a 30 minute break.
- Overlapping truck, driver or assistant.
- Wrong employee role.
- Truck from another store.
- Overlong route.
- Non-AT_STORE order.
- Duplicate order IDs.
- Order from the wrong route.
- Truck capacity exceeded.

## Delivery lifecycle

Normal delivery lifecycle:

PLANNED -> OUT -> COMPLETED

A planned trip can also become:

PLANNED -> CANCELLED

### Schedule

When a delivery is scheduled:

- a delivery trip is created
- selected orders are linked to the trip
- selected orders become SCHEDULED
- planned working time is reserved

### Dispatch

When dispatched:

- trip status becomes OUT
- actual_start is recorded
- linked orders become OUT_FOR_DELIVERY

### Return

When the truck returns:

- actual_end is recorded
- trip becomes COMPLETED
- successful orders become DELIVERED
- failed orders return to AT_STORE
- delivery attempt history remains in delivery_trip_orders

### Cancel

Only a PLANNED trip can be cancelled.

When cancelled:

- trip becomes CANCELLED
- linked orders return to AT_STORE
- cancelled trip no longer reserves working time

## Planned and actual working time

For a planned trip, the roster uses:

- planned_start
- planned_end

For a completed trip, the roster uses:

- actual_start
- actual_end

For an active OUT trip, the effective trip window starts from the
actual start and uses an estimated finish that cannot fall behind the
current time.

After a trip is completed, the actual working time replaces the
planned reservation.

## Route overrun

A delivery may return later than its planned route maximum.

The real actual_end is still recorded.

The trip must not be changed to make the schedule look valid after the
fact.

The reporting/UI should show this as a ROUTE_OVERRUN exception.

## Notes for Developer 5

D5 reporting should use:

- planned_start and planned_end for planned reservations
- actual_start and actual_end for completed work
- CANCELLED trips as zero reserved working time

Weekly calculations use Monday as the beginning of the week.

Failed delivery attempts remain visible in delivery_trip_orders.

A route overrun should be reported as an exception rather than hidden.

## Integration review

Full acceptance testing requires suitable route, store, order, truck
and employee data.

Cases to verify during integration:

- [ ] wrong employee role rejected
- [ ] truck from another store rejected
- [ ] overlapping truck rejected
- [ ] overlapping driver rejected
- [ ] overlapping assistant rejected
- [ ] driver with less than 30 minute rest rejected
- [ ] third consecutive assistant route rejected
- [ ] driver hour 41 rejected
- [ ] assistant hour 61 rejected
- [ ] overlong route rejected
- [ ] non-AT_STORE order rejected
- [ ] duplicate order IDs rejected
- [ ] wrong route rejected
- [ ] excess truck capacity rejected
- [ ] exactly 40 driver hours accepted
- [ ] exactly 60 assistant hours accepted
- [ ] exactly 30 minute break accepted
- [ ] completed trip uses actual hours
- [ ] route overrun is recorded and reported
