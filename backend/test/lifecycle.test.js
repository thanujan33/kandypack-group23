import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { admin } from '../scripts/admin.js';

let server, c, tokens = {};
const base = 'http://127.0.0.1:3102/api';

async function request(path, token, method = 'GET', body) {
    const res = await fetch(base + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
}

before(async () => {
    assert.match(process.env.DB_NAME, /^kandypack_test_\d+$/);
    c = await admin();
    server = spawn(process.execPath, ['src/server.js'], {
        env: {
            ...process.env,
            PORT: '3102',
            DB_USER: process.env.DB_ADMIN_USER,
            DB_PASSWORD: process.env.DB_ADMIN_PASSWORD,
            JWT_SECRET: 'test-only-secret-with-more-than-32-characters'
        },
        stdio: 'pipe'
    });

    let errors = '';
    server.stderr.on('data', b => { errors += b; });

    for (let i = 0; i < 100; i++) {
        try {
            if ((await request('/health')).status === 200) break;
        } catch { }
        if (i === 99) throw new Error('API startup failed on port 3102: ' + errors);
        await new Promise(r => setTimeout(r, 100));
    }

    for (const name of ['admin', 'factory', 'customer1', 'colombo']) {
        const result = await request('/auth/login', null, 'POST', {
            email: name + '@kandypack.test',
            password: process.env.DEMO_PASSWORD
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        tokens[name] = result.body.token;
    }
});

after(async () => {
    server?.kill();
    if (c) await c.end();
});

test('end-to-end order lifecycle through all 7 states with audit verification', async () => {
    // Lookup fixtures for Colombo
    const [[colomboStore]] = await c.query("SELECT id FROM stores WHERE city='Colombo'");
    const [[colomboRoute]] = await c.query("SELECT id FROM routes WHERE store_id=? AND active=1 ORDER BY id LIMIT 1", [colomboStore.id]);
    const [[product]] = await c.query("SELECT id, space_rate FROM products WHERE active=1 ORDER BY id LIMIT 1");
    const [[futureDates]] = await c.query("SELECT CURRENT_DATE today, DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY) delivery");

    // ----------------------------------------------------
    // 1. CUSTOMER: Place Order -> PENDING
    // ----------------------------------------------------
    const orderRes = await request('/orders', tokens.customer1, 'POST', {
        route_id: colomboRoute.id,
        address: '77 Galle Road, Colombo',
        delivery_date: futureDates.delivery,
        items: [{ product_id: product.id, quantity: 10 }]
    });
    assert.equal(orderRes.status, 201, JSON.stringify(orderRes.body));
    const orderId = orderRes.body.id;

    let [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
    assert.equal(orderState.status, 'PENDING');

    // ----------------------------------------------------
    // 2. FACTORY: Create Train & Allocate Order -> ALLOCATED
    // ----------------------------------------------------
    const [[trainTimings]] = await c.query(`
        SELECT 
            DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 SECOND), '%Y-%m-%d %H:%i:%s') dep,
            DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 2 SECOND), '%Y-%m-%d %H:%i:%s') arr
    `);
    const trainRef = 'E2E-TRAIN-' + Date.now();
    const trainRes = await request('/trains', tokens.factory, 'POST', {
        reference: trainRef,
        store_id: colomboStore.id,
        departure_at: trainTimings.dep,
        arrival_at: trainTimings.arr,
        capacity: 100
    });
    assert.equal(trainRes.status, 201, JSON.stringify(trainRes.body));

    const [[train]] = await c.query("SELECT id FROM train_trips WHERE reference=?", [trainRef]);

    const allocRes = await request('/rail/allocate', tokens.factory, 'POST', {
        order_id: orderId,
        train_trip_id: train.id
    });
    assert.equal(allocRes.status, 200, JSON.stringify(allocRes.body));

    [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
    assert.equal(orderState.status, 'ALLOCATED');

    const [[allocation]] = await c.query("SELECT id, quantity FROM train_allocations WHERE order_id=?", [orderId]);
    assert.ok(allocation);

    // ----------------------------------------------------
    // 3. FACTORY: Dispatch Train -> ON_TRAIN
    // ----------------------------------------------------
    // Wait until scheduled departure time arrives (departure_at <= NOW())
    await new Promise(r => setTimeout(r, 1500));

    const dispatchTrainRes = await request(`/trains/${train.id}/dispatch`, tokens.factory, 'POST', {});
    assert.equal(dispatchTrainRes.status, 200, JSON.stringify(dispatchTrainRes.body));

    [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
    assert.equal(orderState.status, 'ON_TRAIN');

    const [[trainState]] = await c.query("SELECT status FROM train_trips WHERE id=?", [train.id]);
    assert.equal(trainState.status, 'IN_TRANSIT');

    // ----------------------------------------------------
    // 4. STORE: Receive Allocation at Depot -> AT_STORE
    // ----------------------------------------------------
    // Wait until scheduled arrival time arrives (arrival_at <= NOW())
    await new Promise(r => setTimeout(r, 1000));

    const receiveRes = await request('/rail/receive', tokens.colombo, 'POST', {
        allocation_id: allocation.id,
        received_qty: allocation.quantity
    });
    assert.equal(receiveRes.status, 200, JSON.stringify(receiveRes.body));

    [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
    assert.equal(orderState.status, 'AT_STORE');

    // ----------------------------------------------------
    // 5. STORE: Schedule Road Delivery Trip -> SCHEDULED
    // ----------------------------------------------------
    // Simulate that the order arrived and is due for delivery today
    await c.query("UPDATE orders SET placed_at=DATE_SUB(CURRENT_DATE, INTERVAL 8 DAY), delivery_date=CURRENT_DATE WHERE id=?", [orderId]);

    const [employees] = await c.query("SELECT * FROM employees WHERE store_id=? ORDER BY id", [colomboStore.id]);
    const [[truck]] = await c.query("SELECT * FROM trucks WHERE store_id=? ORDER BY id DESC LIMIT 1", [colomboStore.id]);
    const driver = employees.filter(e => e.role === 'DRIVER')[1];
    const assistant = employees.filter(e => e.role === 'ASSISTANT')[1];

    const [[timeWindow]] = await c.query(`SELECT DATE_ADD(NOW(), INTERVAL 2 MINUTE) start, DATE_ADD(NOW(), INTERVAL 35 MINUTE) finish`);

    // Ensure test is within today's boundaries
    if (timeWindow.start.slice(0, 10) === futureDates.today) {
        const scheduleRes = await request('/road/schedule', tokens.colombo, 'POST', {
            route_id: colomboRoute.id,
            truck_id: truck.id,
            driver_id: driver.id,
            assistant_id: assistant.id,
            planned_start: timeWindow.start,
            planned_end: timeWindow.finish,
            order_ids: [orderId]
        });
        assert.equal(scheduleRes.status, 201, JSON.stringify(scheduleRes.body));
        const tripId = scheduleRes.body.id;

        [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
        assert.equal(orderState.status, 'SCHEDULED');

        // ----------------------------------------------------
        // 6. STORE: Dispatch Road Delivery -> OUT_FOR_DELIVERY
        // ----------------------------------------------------
        const dispatchRoadRes = await request(`/road/trips/${tripId}/dispatch`, tokens.colombo, 'POST', {});
        assert.equal(dispatchRoadRes.status, 200, JSON.stringify(dispatchRoadRes.body));

        [[orderState]] = await c.query("SELECT status FROM orders WHERE id=?", [orderId]);
        assert.equal(orderState.status, 'OUT_FOR_DELIVERY');

        const [[tripState]] = await c.query("SELECT status FROM delivery_trips WHERE id=?", [tripId]);
        assert.equal(tripState.status, 'OUT');

        // Wait brief delay before return
        await new Promise(r => setTimeout(r, 1100));

        // ----------------------------------------------------
        // 7. STORE: Log Return (Success) -> DELIVERED
        // ----------------------------------------------------
        const [[now]] = await c.query("SELECT NOW() end_time");
        const returnRes = await request(`/road/trips/${tripId}/return`, tokens.colombo, 'POST', {
            actual_end: now.end_time,
            delivered_ids: [orderId]
        });
        assert.equal(returnRes.status, 200, JSON.stringify(returnRes.body));

        [[orderState]] = await c.query("SELECT status, delivered_at FROM orders WHERE id=?", [orderId]);
        assert.equal(orderState.status, 'DELIVERED');
        assert.ok(orderState.delivered_at);
    }

    // ----------------------------------------------------
    // 8. AUDIT TRAIL VERIFICATION
    // ----------------------------------------------------
    const [auditRecords] = await c.query(
        "SELECT entity, action, actor_id FROM audit_log WHERE entity IN ('orders', 'train_trips', 'train_allocations') ORDER BY id DESC LIMIT 10"
    );
    assert.ok(auditRecords.length >= 3);
    assert.ok(auditRecords.some(a => a.entity === 'orders'));
});

test('failed delivery returns order outcome to FAILED and status to AT_STORE for re-scheduling', async () => {
    // Select an order that was seeded at AT_STORE for today from another store (e.g. Negombo or Galle)
    const [[o]] = await c.query(`
        SELECT o.*, r.store_id 
        FROM orders o 
        JOIN routes r ON r.id = o.route_id
        WHERE o.status = 'AT_STORE' AND o.delivery_date = CURRENT_DATE AND r.store_id <> 1
        ORDER BY o.id DESC LIMIT 1
    `);
    assert.ok(o);

    const [employees] = await c.query("SELECT * FROM employees WHERE store_id=? ORDER BY id", [o.store_id]);
    const [[truck]] = await c.query("SELECT * FROM trucks WHERE store_id=? ORDER BY id LIMIT 1", [o.store_id]);
    const driver = employees.find(e => e.role === 'DRIVER');
    const assistant = employees.find(e => e.role === 'ASSISTANT');

    const [[time]] = await c.query(`SELECT DATE_ADD(NOW(), INTERVAL 2 MINUTE) start, DATE_ADD(NOW(), INTERVAL 30 MINUTE) finish`);
    if (time.start.slice(0, 10) !== o.delivery_date) return;

    // Schedule delivery
    const plan = await request('/road/schedule', tokens.admin, 'POST', {
        route_id: o.route_id,
        truck_id: truck.id,
        driver_id: driver.id,
        assistant_id: assistant.id,
        planned_start: time.start,
        planned_end: time.finish,
        order_ids: [o.id]
    });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    const tripId = plan.body.id;

    // Dispatch
    assert.equal((await request(`/road/trips/${tripId}/dispatch`, tokens.admin, 'POST', {})).status, 200);

    await new Promise(r => setTimeout(r, 1100));
    const [[end]] = await c.query("SELECT NOW() end_time");

    // Return with empty delivered_ids (simulating failed delivery)
    const ret = await request(`/road/trips/${tripId}/return`, tokens.admin, 'POST', {
        actual_end: end.end_time,
        delivered_ids: []
    });
    assert.equal(ret.status, 200, JSON.stringify(ret.body));

    // Verify order returns to AT_STORE
    const [[revertedOrder]] = await c.query("SELECT status FROM orders WHERE id=?", [o.id]);
    assert.equal(revertedOrder.status, 'AT_STORE');

    // Verify delivery_trip_orders outcome is FAILED
    const [[tripOrder]] = await c.query("SELECT outcome FROM delivery_trip_orders WHERE trip_id=? AND order_id=?", [tripId, o.id]);
    assert.equal(tripOrder.outcome, 'FAILED');
});
