import { Router } from 'express';
import { read } from '../db.js';
import { roles, int, fail } from '../http.js';
const r = Router();
function quarter(q) {
    const y = int(q.year, 'Year'), n = int(q.quarter, 'Quarter');
    if (y < 2000 || y > 2100 || n > 4) fail('Choose year 2000 to 2100 and quarter 1 to 4');
    const start = `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`;
    const end = n === 4 ? `${y + 1}-01-01` : `${y}-${String(n * 3 + 1).padStart(2, '0')}-01`;
    return [start, end];
}
r.get('/reports/quarterly', roles('ADMIN', 'FACTORY'), async (req, res) => res.json(await read(
    `SELECT DATE_FORMAT(placed_at,'%Y-%m') month,COUNT(DISTINCT order_id) orders,
    SUM(line_total) sales_LKR,SUM(quantity) units,SUM(space_units) space_units
    FROM v_sales_lines WHERE placed_at>=? AND placed_at<?
    GROUP BY DATE_FORMAT(placed_at,'%Y-%m') ORDER BY month`, quarter(req.query))));
r.get('/reports/products', roles('ADMIN', 'FACTORY'), async (req, res) => res.json(await read(
    `SELECT product_id,product,SUM(quantity) units,COUNT(DISTINCT order_id) order_count,
    SUM(line_total) sales_LKR FROM v_sales_lines WHERE placed_at>=? AND placed_at<?
    GROUP BY product_id,product ORDER BY units DESC,product_id`, quarter(req.query))));
r.get('/reports/locations', roles('ADMIN', 'FACTORY'), async (req, res) => {
    const dates = quarter(req.query);
    res.json(await read(`SELECT 'CITY' level,city,NULL route_id,NULL route,
    SUM(line_total) sales_LKR,SUM(quantity) units FROM v_sales_lines
    WHERE placed_at>=? AND placed_at<? GROUP BY city
    UNION ALL SELECT 'ROUTE',city,route_id,route,SUM(line_total),SUM(quantity)
    FROM v_sales_lines WHERE placed_at>=? AND placed_at<? GROUP BY city,route_id,route`, [...dates, ...dates]));
});
r.get('/reports/hours', roles('ADMIN', 'FACTORY'), async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.week || '')) fail('Choose a date in the reporting week');
    const week = req.query.week;
    res.json(await read(`WITH bounds AS(SELECT DATE_SUB(DATE(?),INTERVAL WEEKDAY(?) DAY) a),
    segments AS(SELECT w.employee_id,w.status,
      TIMESTAMPDIFF(MINUTE,GREATEST(w.starts,b.a),LEAST(w.finishes,b.a+INTERVAL 7 DAY))/60 hours
      FROM v_staff_windows w CROSS JOIN bounds b WHERE w.starts<b.a+INTERVAL 7 DAY AND w.finishes>b.a)
    SELECT e.id,e.name,e.role,s.city,
      COALESCE(SUM(IF(x.status='COMPLETED',x.hours,0)),0) actual_hours,
      COALESCE(SUM(IF(x.status<>'COMPLETED',x.hours,0)),0) reserved_hours,
      IF(e.role='DRIVER',40,60) weekly_limit,
      GREATEST(0,COALESCE(SUM(x.hours),0)-IF(e.role='DRIVER',40,60)) excess_hours
    FROM employees e JOIN stores s ON s.id=e.store_id LEFT JOIN segments x ON x.employee_id=e.id
    GROUP BY e.id,e.name,e.role,s.city ORDER BY e.id`, [week, week]));
});
r.get('/reports/trucks', roles('ADMIN', 'FACTORY'), async (req, res) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '')) fail('Choose month YYYY-MM');
    res.json(await read(`WITH b AS(SELECT DATE(?) a), logs AS(
    SELECT w.truck_id,
      IF(w.starts>=b.a AND w.starts<b.a+INTERVAL 1 MONTH,1,0) trip_count,
      TIMESTAMPDIFF(MINUTE,GREATEST(w.starts,b.a),LEAST(w.finishes,b.a+INTERVAL 1 MONTH))/60 hours
      FROM v_trip_windows w CROSS JOIN b WHERE status='COMPLETED'
      AND w.starts<b.a+INTERVAL 1 MONTH AND w.finishes>b.a)
    SELECT t.id,t.plate,s.city,COALESCE(SUM(l.trip_count),0) completed_trips,
      COALESCE(SUM(l.hours),0) actual_hours,DAY(LAST_DAY(b.a))*8 assumed_available_hours,
      ROUND(100*COALESCE(SUM(l.hours),0)/(DAY(LAST_DAY(b.a))*8),2) utilization_percent
    FROM trucks t JOIN stores s ON s.id=t.store_id CROSS JOIN b LEFT JOIN logs l ON l.truck_id=t.id
    GROUP BY t.id,t.plate,s.city,b.a ORDER BY t.id`, [req.query.month + '-01']));
});
r.get('/reports/history', roles('ADMIN', 'FACTORY', 'CUSTOMER'), async (req, res) => {
    const id = req.user.role === 'CUSTOMER' ? req.user.id : int(req.query.customer_id);
    res.json(await read(`SELECT o.id,o.placed_at,o.delivery_date,o.status,o.address,o.delivered_at,
    r.name route,s.city,v.total_value,v.total_quantity,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('product',p.name,'quantity',i.quantity))
      FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id) items,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('trip',d.id,'start',d.actual_start,'end',d.actual_end,
      'outcome',x.outcome,'truck',t.plate,'driver',e.name))
      FROM delivery_trip_orders x JOIN delivery_trips d ON d.id=x.trip_id
      JOIN trucks t ON t.id=d.truck_id JOIN employees e ON e.id=d.driver_id WHERE x.order_id=o.id) deliveries
    FROM orders o JOIN routes r ON r.id=o.route_id JOIN stores s ON s.id=r.store_id
    JOIN v_order_totals v ON v.order_id=o.id WHERE o.customer_id=? ORDER BY o.placed_at DESC`, [id]));
});
r.get('/reports/audit', roles('ADMIN'), async (req, res) => res.json(await read(
    'SELECT * FROM audit_log ORDER BY id DESC LIMIT 200')));
export default r;
