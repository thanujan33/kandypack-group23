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
test('order history rejects malformed and impossible calendar dates', async () => {
    for (const field of ['from', 'to']) {
        for (const value of ['not-a-date', '2026-02-30', '2025-02-29', '1900-02-29',
            '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '0000-01-01',
            '2026-1-01', '2026-01-01T00:00:00Z', ' 2026-01-01 ']) {
            const r = await request('/orders?' + new URLSearchParams({[field]:value}), tokens.customer1);
            assert.equal(r.status, 400, `${field}=${value}`);
            assert.match(r.body.error, /valid.*date/i);
        }
    }
    const repeated = await request('/orders?from=2026-01-01&from=2026-01-02', tokens.customer1);
    assert.equal(repeated.status, 400);
});
test('order history rejects reversed date ranges', async () => {
    const r = await request('/orders?from=2026-10-11&to=2026-10-10', tokens.customer1);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /on or before/i);
});
test('valid history filters preserve inclusive dates and customer scope', async () => {
    const all = await request('/orders', tokens.customer1);
    assert.equal(all.status, 200);
    const empty = await request('/orders?from=&to=', tokens.customer1);
    assert.deepEqual(empty.body, all.body);
    const day = all.body[0].placed_at.slice(0, 10);
    for (const filters of [{from:day}, {to:day}, {from:day,to:day}]) {
        const r = await request('/orders?' + new URLSearchParams(filters), tokens.customer1);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.map(o=>o.id), all.body.filter(o=>{
            const placed = o.placed_at.slice(0,10);
            return (!filters.from || placed>=filters.from) && (!filters.to || placed<=filters.to);
        }).map(o=>o.id));
    }
    for (const day of ['2024-02-29','2000-02-29']) {
        assert.equal((await request(`/orders?from=${day}&to=${day}`, tokens.customer1)).status, 200);
    }
});
test('invalid quantities leave no partial orders or items, including database limits', async () => {
    const [[route]] = await c.query('SELECT id FROM routes WHERE active=1 ORDER BY id LIMIT 1');
    const [products] = await c.query('SELECT id FROM products WHERE active=1 ORDER BY id LIMIT 2');
    const [[dates]] = await c.query('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY) delivery');
    const counts = async () => (await c.query(`SELECT
        (SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM order_items) items`))[0][0];
    const before = await counts();
    for (const quantity of [true,false,null,[],[1],{},'', ' ',0,-1,1.5,'1.5',100001,'100001',
        Number.MAX_SAFE_INTEGER+1,'Infinity','NaN',undefined]) {
        const r = await request('/orders', tokens.customer1, 'POST', {
            route_id:route.id,address:'Regression test',delivery_date:dates.delivery,
            items:[{product_id:products[0].id,quantity:1},{product_id:products[1].id,quantity}]
        });
        assert.equal(r.status, 400, `quantity=${JSON.stringify(quantity)}`);
        assert.match(r.body.error, /quantity/i);
        assert.deepEqual(await counts(), before);
    }
    const [[customer]] = await c.query("SELECT id FROM users WHERE email='customer1@kandypack.test'");
    for (const quantity of [0,1.5,100001]) {
        await assert.rejects(c.query('CALL sp_place_order(?,?,?,?,?,?)', [customer.id,route.id,
            'Regression test','',dates.delivery,JSON.stringify([{product_id:products[0].id,quantity}])]),
            /whole quantities/);
        assert.deepEqual(await counts(), before);
    }
});
test('whole quantities retain supported numeric formats and upper boundary', async () => {
    const [[route]] = await c.query('SELECT id FROM routes WHERE active=1 ORDER BY id LIMIT 1');
    const [[product]] = await c.query('SELECT id FROM products WHERE active=1 ORDER BY id LIMIT 1');
    const [[dates]] = await c.query('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY) delivery');
    for (const quantity of [1,'2','3.0',' 4 ','5e0','0x6',100000]) {
        const r = await request('/orders', tokens.customer1, 'POST', {
            route_id:String(route.id),address:'Regression test',delivery_date:dates.delivery,
            items:[{product_id:String(product.id),quantity}]
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        try {
            const [[item]] = await c.query('SELECT quantity FROM order_items WHERE order_id=?',[r.body.id]);
            assert.equal(item.quantity,Number(quantity));
            const detail = await request('/orders/'+r.body.id,tokens.customer1);
            assert.equal(detail.status,200);
            assert.equal(detail.body.order.status,'PENDING');
        } finally {
            // Remove only the fixtures created here; the integration suite expects 40 seed orders.
            await c.query('DELETE FROM order_items WHERE order_id=?',[r.body.id]);
            await c.query('DELETE FROM orders WHERE id=?',[r.body.id]);
        }
    }
});
test('server expires idle sessions and logout revokes a token', async () => {
    await c.query(`UPDATE sessions s JOIN users u ON u.id=s.user_id
    SET s.last_seen=DATE_SUB(NOW(),INTERVAL 31 MINUTE) WHERE u.email='customer2@kandypack.test'`);
    assert.equal((await request('/me', tokens.customer2)).status, 401);
    assert.equal((await request('/logout', tokens.factory, 'POST', {})).status, 200);
    assert.equal((await request('/me', tokens.factory)).status, 401);
});
test('role-based access control guards unauthorized mutations', async () => {
    // Re-authenticate factory since the logout test revoked its initial token
    const login = await request('/auth/login', null, 'POST', {
        email: 'factory@kandypack.test', password: process.env.DEMO_PASSWORD
    });
    tokens.factory = login.body.token;

    // 1. Non-admin cannot create staff accounts
    const staffAttempt = await request('/staff-users', tokens.factory, 'POST', {
        name: 'Unauthorized User', email: 'unauthorized@kandypack.test',
        role: 'FACTORY', password: 'ValidPassword123!'
    });
    assert.equal(staffAttempt.status, 403);

    // 2. Customer cannot create products
    const productAttempt = await request('/products', tokens.customer1, 'POST', {
        name: 'Unauthorized Product', unit_price: 100, space_rate: 1
    });
    assert.equal(productAttempt.status, 403);

    // 3. Customer cannot create routes
    const routeAttempt = await request('/routes', tokens.customer1, 'POST', {
        store_id: 1, name: 'Unauthorized Route', coverage_area: 'Unauthorized Area', max_minutes: 60
    });
    assert.equal(routeAttempt.status, 403);

    // 4. Customer and Factory users cannot access road fleet resources
    assert.equal((await request('/road/resources', tokens.customer1)).status, 403);
    assert.equal((await request('/road/resources', tokens.factory)).status, 403);
});
test('store managers are strictly isolated to their own store resources', async () => {
    const colomboRes = await request('/road/resources', tokens.colombo);
    assert.equal(colomboRes.status, 200);
    const [[colomboStore]] = await c.query("SELECT id FROM stores WHERE city='Colombo'");
    assert.ok(colomboRes.body.trucks.length > 0);
    assert.ok(colomboRes.body.employees.length > 0);
    for (const truck of colomboRes.body.trucks) {
        assert.equal(truck.store_id, colomboStore.id);
    }
    for (const emp of colomboRes.body.employees) {
        assert.equal(emp.store_id, colomboStore.id);
    }
});

