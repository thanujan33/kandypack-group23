import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin } from '../scripts/admin.js';
let c, customer, product, route, today, serial = 0;
const rows = async (sql, args = []) => (await c.query(sql, args))[0];
const one = async (sql, args = []) => (await rows(sql, args))[0];
async function createOrder(q = 5, r = route) {
    const [sets] = await c.query('CALL sp_place_order(?,?,?,?,?,?)', [
        customer, r, 'Demo test address', '', today.delivery,
        JSON.stringify([{ product_id: product, quantity: q }])]);
    return sets[0][0].id;
}
before(async () => {
    assert.match(process.env.DB_NAME, /^kandypack_test_\d+$/);
    c = await admin();
    customer = (await one("SELECT id FROM users WHERE email='customer1@kandypack.test'")).id;
    product = (await one("SELECT id FROM products WHERE name='Detergent box'")).id;
    route = (await one('SELECT id FROM routes ORDER BY id LIMIT 1')).id;
    today = await one(`SELECT CURRENT_DATE today,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY) delivery,
    DATE_ADD(DATE_SUB(CURRENT_DATE,INTERVAL WEEKDAY(CURRENT_DATE) DAY),INTERVAL 14 DAY) monday`);
    await c.query('SET @actor=?', [customer]);
});
after(async () => { await c.end(); });
test('required fixtures and exact order totals', async () => {
    assert.equal((await one('SELECT COUNT(*) n FROM orders')).n, 40);
    assert.ok((await one('SELECT COUNT(*) n FROM routes')).n >= 10);
    const sums = await one(`SELECT (SELECT SUM(line_total) FROM order_items) a,
    (SELECT SUM(total_value) FROM v_order_totals) b`);
    assert.equal(sums.a, sums.b);
});
test('lead time, duplicate products and whole quantities are database rules', async () => {
    const args = [customer, route, 'Test', '', today.today];
    await assert.rejects(c.query('CALL sp_place_order(?,?,?,?,?,?)', [
        ...args, JSON.stringify([{ product_id: product, quantity: 1 }])]), /7 days/);
    await assert.rejects(c.query('CALL sp_place_order(?,?,?,?,?,?)', [
        customer, route, 'Test', '', today.delivery, JSON.stringify([{ product_id: product, quantity: 1.5 }])]), /whole quantities/);
    await assert.rejects(c.query('CALL sp_place_order(?,?,?,?,?,?)', [
        customer, route, 'Test', '', today.delivery, JSON.stringify([{ product_id: product, quantity: 1 }, { product_id: product, quantity: 2 }])]), /duplicate/);
});
test('order prices remain unchanged after catalog edit', async () => {
    const id = await createOrder();
    const before = await one('SELECT total_value FROM v_order_totals WHERE order_id=?', [id]);
    await c.query('UPDATE products SET unit_price=unit_price+1 WHERE id=?', [product]);
    assert.deepEqual(await one('SELECT total_value FROM v_order_totals WHERE order_id=?', [id]), before);
});
test('overflow is split by product and insufficient capacity rolls back fully', async () => {
    const [o] = await rows(`SELECT o.id,r.store_id FROM orders o JOIN routes r ON r.id=o.route_id
    JOIN order_items i ON i.order_id=o.id WHERE i.quantity=250`);
    const train = await one("SELECT id FROM train_trips WHERE store_id=? AND status='SCHEDULED' ORDER BY departure_at,id LIMIT 1", [o.store_id]);
    await c.query('CALL sp_allocate_order(?,?)', [o.id, train.id]);
    assert.ok((await one('SELECT COUNT(DISTINCT train_trip_id) n FROM train_allocations WHERE order_id=?', [o.id])).n > 1);
    assert.equal((await one('SELECT MIN(available_capacity)<0 bad FROM v_train_capacity')).bad, 0);
    const huge = await createOrder(100000);
    const t = await one("SELECT t.id FROM train_trips t JOIN routes r ON r.store_id=t.store_id WHERE r.id=? AND t.status='SCHEDULED' ORDER BY t.departure_at LIMIT 1", [route]);
    await assert.rejects(c.query('CALL sp_allocate_order(?,?)', [huge, t.id]), /Nothing was allocated/);
    assert.equal((await one('SELECT COUNT(*) n FROM train_allocations WHERE order_id=?', [huge])).n, 0);
    assert.equal((await one('SELECT status FROM orders WHERE id=?', [huge])).status, 'PENDING');
});
test('two concurrent allocations cannot oversell the same trains', async () => {
    const ids = [await createOrder(250), await createOrder(250)];
    const t = await one(`SELECT t.id FROM train_trips t JOIN routes r ON r.store_id=t.store_id
    WHERE r.id=? AND t.status='SCHEDULED' ORDER BY t.departure_at LIMIT 1`, [route]);
    const clients = await Promise.all([admin(), admin()]);
    try {
        const results = await Promise.allSettled(clients.map((client, i) => client.query('CALL sp_allocate_order(?,?)', [ids[i], t.id])));
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal((await one('SELECT MIN(available_capacity)<0 bad FROM v_train_capacity')).bad, 0);
    } finally { await Promise.all(clients.map(x => x.end())); }
});
async function team() {
    serial++; const tag = 'TEST-' + serial;
    const store = (await one('SELECT store_id FROM routes WHERE id=?', [route])).store_id;
    const [r] = await c.query('INSERT INTO routes(store_id,name,coverage_area,max_minutes) VALUES(?,?,?,480)', [store, tag, tag]);
    const d = [], a = [], trucks = [];
    for (let i = 0; i < 3; i++) {
        const [driver] = await c.query("INSERT INTO employees(store_id,role,name,nic,phone) VALUES(?,'DRIVER',?,?,'0')", [store, tag + 'D' + i, tag + 'D' + i]); d.push(driver.insertId);
        const [truck] = await c.query("INSERT INTO trucks(store_id,plate,type,capacity) VALUES(?,?,'Test',1000)", [store, tag + 'T' + i]); trucks.push(truck.insertId);
    }
    for (let i = 0; i < 2; i++) {
        const [assistant] = await c.query("INSERT INTO employees(store_id,role,name,nic,phone) VALUES(?,'ASSISTANT',?,?,'0')", [store, tag + 'A' + i, tag + 'A' + i]); a.push(assistant.insertId);
    }
    return { r: r.insertId, d, a, trucks };
}
const addTrip = (t, day, start, end, driver = 0, assistant = 0, truck = driver) => c.query(
    `INSERT INTO delivery_trips(route_id,truck_id,driver_id,assistant_id,planned_start,planned_end)
    VALUES(?,?,?,?,TIMESTAMP(DATE_ADD(?,INTERVAL ? DAY),?),TIMESTAMP(DATE_ADD(?,INTERVAL ? DAY),?))`,
    [t.r, t.trucks[truck], t.d[driver], t.a[assistant], today.monday, day, start, today.monday, day, end]);
test('overlap, driver rest and assistant third consecutive route are rejected', async () => {
    const t = await team(); await addTrip(t, 0, '09:00:00', '11:00:00');
    await assert.rejects(addTrip(t, 0, '10:00:00', '12:00:00'), /overlaps/);
    await assert.rejects(addTrip(t, 0, '11:00:00', '13:00:00', 0, 1, 1), /30 minute break/);
    await addTrip(t, 0, '11:00:00', '13:00:00', 1, 0, 1);
    await assert.rejects(addTrip(t, 0, '13:00:00', '14:00:00', 2, 0, 2), /two consecutive/);
    await addTrip(t, 0, '13:30:00', '14:30:00', 2, 0, 2);
});
test('driver 40 hours and assistant 60 hours include planned reservations', async () => {
    const t = await team();
    for (let d = 0; d < 5; d++)await addTrip(t, d, '09:00:00', '17:00:00');
    await assert.rejects(addTrip(t, 5, '09:00:00', '10:00:00'), /Weekly limit/);
    const a = await team();
    for (let d = 0; d < 7; d++)await addTrip(a, d, '09:00:00', '17:00:00', d % 2);
    await assert.rejects(addTrip(a, 6, '18:00:00', '23:00:00', 2), /Weekly limit/);
});
test('hours crossing Sunday midnight are split between ISO weeks', async () => {
    const t = await team();
    await c.query(`INSERT INTO delivery_trips(route_id,truck_id,driver_id,assistant_id,planned_start,planned_end)
    VALUES(?,?,?,?,TIMESTAMP(DATE_ADD(?,INTERVAL 6 DAY),'23:00:00'),TIMESTAMP(DATE_ADD(?,INTERVAL 7 DAY),'01:00:00'))`,
        [t.r, t.trucks[0], t.d[0], t.a[0], today.monday, today.monday]);
    const x = await one('SELECT fn_work_minutes(?,?,0) first_week,fn_work_minutes(?,DATE_ADD(?,INTERVAL 7 DAY),0) next_week',
        [t.d[0], today.monday, t.d[0], today.monday]);
    assert.equal(Number(x.first_week), 60); assert.equal(Number(x.next_week), 60);
});
test('audit rows are append only', async () => {
    assert.ok((await one('SELECT COUNT(*) n FROM audit_log')).n > 0);
    await assert.rejects(c.query('UPDATE audit_log SET actor_id=NULL LIMIT 1'), /append only/);
    await assert.rejects(c.query('DELETE FROM audit_log LIMIT 1'), /append only/);
});
