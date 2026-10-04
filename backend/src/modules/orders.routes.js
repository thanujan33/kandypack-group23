import { Router } from 'express';
import { read, transaction, call } from '../db.js';
import { int, text, roles, fail, checkStore } from '../http.js';

const r = Router();

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

export default r;
