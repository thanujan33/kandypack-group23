import { Router } from 'express';
import { read, transaction, call } from '../db.js';
import { int, text, roles, fail, checkStore } from '../http.js';

const r = Router();

function historyDate(value, name) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
    fail(`${name} must be a valid date in YYYY-MM-DD format`);
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value)
    fail(`${name} must be a valid calendar date`);
  return value;
}

function quantity(value) {
  if (typeof value !== 'number' && typeof value !== 'string')
    fail('Quantity must be a positive whole number between 1 and 100000');
  const n = int(value, 'Quantity');
  if (n > 100000) fail('Quantity must be between 1 and 100000');
  return n;
}

r.get('/products', async (req, res) => res.json(await read(
  'SELECT * FROM products WHERE active=1 ORDER BY id')));

const productValues = b => {
  if (!Number.isFinite(Number(b.unit_price)) || Number(b.unit_price) <= 0 ||
      !Number.isFinite(Number(b.space_rate)) || Number(b.space_rate) <= 0)
    fail('Price and space must be positive');
  return [text(b.name, 'Name', 100), Number(b.unit_price), Number(b.space_rate)];
};

r.post('/products', roles('ADMIN', 'FACTORY'), async (req, res) => {
  await transaction(req.user.id, c => c.execute(
    'INSERT INTO products(name,unit_price,space_rate) VALUES(?, ?, ?)', productValues(req.body)));
  res.status(201).json({message: 'Product added'});
});

r.put('/products/:id', roles('ADMIN', 'FACTORY'), async (req, res) => {
  await transaction(req.user.id, c => c.execute(
    'UPDATE products SET name=?,unit_price=?,space_rate=?,active=? WHERE id=?',
    [...productValues(req.body), req.body.active !== false, int(req.params.id)]));
  res.json({message: 'Product updated; existing order snapshots are unchanged'});
});

r.get('/orders',async(req,res)=>{
  const from=historyDate(req.query.from,'From'),to=historyDate(req.query.to,'To');
  if(from && to && from>to) fail('From date must be on or before To date');
  const params=[];let where='1=1';
  if(req.user.role==='CUSTOMER'){where+=' AND o.customer_id=?';params.push(req.user.id);}
  if(req.user.role==='STORE'){where+=' AND rt.store_id=?';params.push(req.user.store_id||0);}
  if(from){where+=' AND o.placed_at>=?';params.push(from);}
  if(to){where+=' AND o.placed_at<DATE_ADD(?,INTERVAL 1 DAY)';params.push(to);}
  res.json(await read(`SELECT o.*,u.name customer,rt.name route,s.city,t.total_value,
    t.total_quantity,t.total_space FROM orders o JOIN users u ON u.id=o.customer_id
    JOIN routes rt ON rt.id=o.route_id JOIN stores s ON s.id=rt.store_id
    JOIN v_order_totals t ON t.order_id=o.id WHERE ${where} ORDER BY o.id DESC`,params));
});
r.get('/orders/:id',async(req,res)=>{
  const id=int(req.params.id);
  const [o]=await read(`SELECT o.*,rt.store_id,rt.name route,s.city FROM orders o
    JOIN routes rt ON rt.id=o.route_id JOIN stores s ON s.id=rt.store_id WHERE o.id=?`,[id]);
  if(!o)fail('Order not found',404);
  if(req.user.role==='CUSTOMER'&&o.customer_id!==req.user.id)fail('Order not found',404);
  checkStore(req,o.store_id);
  const items=await read(`SELECT i.*,p.name FROM order_items i JOIN products p
    ON p.id=i.product_id WHERE i.order_id=?`,[id]);
  res.json({order:o,items});
});
r.post('/orders',roles('CUSTOMER'),async(req,res)=>{
  const b=req.body;
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail('Add 1 to 100 products');
  const items=b.items.map(i=>({product_id:int(i.product_id),quantity:quantity(i.quantity)}));
  const result=await call(req.user.id,'sp_place_order',[req.user.id,int(b.route_id),
    text(b.address,'Delivery address'),String(b.instructions||'').slice(0,500),
    text(b.delivery_date,'Delivery date',10),JSON.stringify(items)]);
  res.status(201).json(result[0]);
});

export default r;
