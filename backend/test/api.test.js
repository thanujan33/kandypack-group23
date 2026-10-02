import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { admin } from '../scripts/admin.js';
let server, c, tokens = {};
const base = 'http://127.0.0.1:3101/api';
async function request(path, token, method = 'GET', body) {
    const res = await fetch(base + path, {
        method, headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
        }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
}
before(async () => {
    assert.match(process.env.DB_NAME, /^kandypack_test_\d+$/);
    c = await admin();
    server = spawn(process.execPath, ['src/server.js'], {
        env: {
            ...process.env, PORT: '3101',
            DB_USER: process.env.DB_ADMIN_USER, DB_PASSWORD: process.env.DB_ADMIN_PASSWORD,
            JWT_SECRET: 'test-only-secret-with-more-than-32-characters'
        }, stdio: 'pipe'
    });
    let errors = ''; server.stderr.on('data', b => { errors += b; });
    for (let i = 0; i < 100; i++) {
        try { if ((await request('/health')).status === 200) break; } catch { }
        if (i === 99) throw new Error('API startup failed: ' + errors);
        await new Promise(r => setTimeout(r, 100));
    }
    for (const name of ['admin', 'factory', 'customer1', 'customer2', 'colombo', 'galle']) {
        const result = await request('/auth/login', null, 'POST', {
            email: name + '@kandypack.test', password: process.env.DEMO_PASSWORD
        });
        assert.equal(result.status, 200, JSON.stringify(result.body)); tokens[name] = result.body.token;
    }
});
after(async () => { server?.kill(); if (c) await c.end(); });
test('customers cannot read other customers orders or staff screens', async () => {
    const a = await request('/orders', tokens.customer1);
    assert.equal(a.status, 200); assert.ok(a.body.length);
    const forbidden = await request('/orders/' + a.body[0].id, tokens.customer2);
    assert.equal(forbidden.status, 404);
    assert.equal((await request('/trains', tokens.customer1)).status, 403);
    assert.equal((await request('/reports/audit', tokens.factory)).status, 403);
});
test('six report APIs return valid data', async () => {
    const [[clock]] = await c.query(`SELECT YEAR(MIN(placed_at)) year,QUARTER(MIN(placed_at)) quarter,
    DATE(MIN(placed_at)) week,DATE_FORMAT(MIN(placed_at),'%Y-%m') month FROM orders`);
    const [[u]] = await c.query("SELECT id FROM users WHERE email='customer1@kandypack.test'");
    for (const path of [
        `/reports/quarterly?year=${clock.year}&quarter=${clock.quarter}`,
        `/reports/products?year=${clock.year}&quarter=${clock.quarter}`,
        `/reports/locations?year=${clock.year}&quarter=${clock.quarter}`,
        `/reports/hours?week=${clock.week}`, `/reports/trucks?month=${clock.month}`,
        `/reports/history?customer_id=${u.id}`]) {
        const r = await request(path, tokens.admin); assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.ok(Array.isArray(r.body) && r.body.length > 0, path);
    }
});
test('store scope is enforced on a mutation', async () => {
    const manifest = await request('/rail/manifest', tokens.colombo);
    const row = manifest.body[0]; assert.ok(row);
    assert.equal((await request('/rail/receive', tokens.galle, 'POST', {
        allocation_id: row.id, received_qty: row.quantity
    })).status, 403);
});
test('reserve dispatch return and failed-order retry keep correct states', async () => {
    const [[o]] = await c.query(`SELECT o.*,r.store_id FROM orders o JOIN routes r ON r.id=o.route_id
    WHERE o.status='AT_STORE' AND o.delivery_date=CURRENT_DATE ORDER BY o.id LIMIT 1`);
    assert.ok(o);
    const [employees] = await c.query('SELECT * FROM employees WHERE store_id=? ORDER BY id', [o.store_id]);
    const [[truck]] = await c.query('SELECT * FROM trucks WHERE store_id=? ORDER BY id LIMIT 1', [o.store_id]);
    const [[time]] = await c.query(`SELECT DATE_ADD(NOW(),INTERVAL 2 MINUTE) start,
    DATE_ADD(NOW(),INTERVAL 32 MINUTE) finish`);
    const body = {
        route_id: o.route_id, truck_id: truck.id,
        driver_id: employees.find(e => e.role === 'DRIVER').id, assistant_id: employees.find(e => e.role === 'ASSISTANT').id,
        planned_start: time.start, planned_end: time.finish, order_ids: [o.id]
    };
    // Avoid a calendar-boundary ambiguity if tests are run in the last 32 minutes of a day.
    if (time.start.slice(0, 10) !== o.delivery_date) return;
    const plan = await request('/road/schedule', tokens.admin, 'POST', body);
    assert.equal(plan.status, 201, JSON.stringify(plan.body)); const id = plan.body.id;
    assert.equal((await request('/road/schedule', tokens.admin, 'POST', body)).status, 409);
    assert.equal((await request(`/road/trips/${id}/dispatch`, tokens.admin, 'POST', {})).status, 200);
    await new Promise(r => setTimeout(r, 1100));
    const [[end]] = await c.query('SELECT NOW() end');
    const result = await request(`/road/trips/${id}/return`, tokens.admin, 'POST', { actual_end: end.end, delivered_ids: [] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const [[state]] = await c.query('SELECT status FROM orders WHERE id=?', [o.id]);
    assert.equal(state.status, 'AT_STORE');
    const [[trip]] = await c.query('SELECT actual_end FROM delivery_trips WHERE id=?', [id]);
    assert.ok(trip.actual_end);
});
test('server expires idle sessions and logout revokes a token', async () => {
    await c.query(`UPDATE sessions s JOIN users u ON u.id=s.user_id
    SET s.last_seen=DATE_SUB(NOW(),INTERVAL 31 MINUTE) WHERE u.email='customer2@kandypack.test'`);
    assert.equal((await request('/me', tokens.customer2)).status, 401);
    assert.equal((await request('/logout', tokens.factory, 'POST', {})).status, 200);
    assert.equal((await request('/me', tokens.factory)).status, 401);
});
