import { Router } from 'express';
import { read, transaction } from '../db.js';
import { roles, text, int, fail } from '../http.js';
const r = Router();
r.get('/directory', async (req,res) => res.json({
  stores: await read('SELECT id,city,location FROM stores ORDER BY id'),
  routes: await read(`SELECT r.*,s.city FROM routes r JOIN stores s ON s.id=r.store_id
    WHERE r.active=1 ORDER BY s.city,r.name`)
}));
r.get('/users', roles('ADMIN'), async (req,res) => res.json(await read(
  'SELECT id,name,email,role,active FROM users ORDER BY id')));
r.patch('/users/:id', roles('ADMIN'), async (req,res) => {
  const id=int(req.params.id), {role,active}=req.body;
  if (id === req.user.id) fail('Use another administrator to change your own account');
  if (!['ADMIN','FACTORY','STORE','CUSTOMER'].includes(role)) fail('Invalid role');
  // Existing customer/staff identities are not interchangeable after they have records.
  await transaction(req.user.id, async c => {
    const [[u]] = await c.query('SELECT role FROM users WHERE id=? FOR UPDATE',[id]);
    if (!u) fail('User not found',404);
    if (u.role === 'CUSTOMER' && role !== 'CUSTOMER')
      fail('Create a separate staff account; preserve the customer identity');
    if (u.role !== 'CUSTOMER' && role === 'CUSTOMER') fail('Staff cannot become a customer');
    const [[s]] = await c.query('SELECT id FROM stores WHERE manager_id=?',[id]);
    if (s && role !== 'STORE') fail('Reassign the store manager first');
    await c.execute('UPDATE users SET role=?,active=? WHERE id=?',[role,!!active,id]);
  });
  res.json({message:'User updated'});
});
r.post('/staff-users', roles('ADMIN'), async (req,res) => {
  const bcrypt = (await import('bcryptjs')).default;
  const b=req.body;
  if (!['ADMIN','FACTORY','STORE'].includes(b.role)) fail('Invalid staff role');
  const password=text(b.password,'Password',72);
  if (password.length<12 || Buffer.byteLength(password)>72) fail('Password length invalid');
  await transaction(req.user.id,c=>c.execute(
    'INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',
    [text(b.name,'Name',100),text(b.email,'Email',190).toLowerCase(),
      bcrypt.hashSync(password,12),b.role]));
  res.status(201).json({message:'Staff account created'});
});
r.post('/stores', roles('ADMIN'), async(req,res)=>{
  const b=req.body;
  await transaction(req.user.id,c=>c.execute(
    'INSERT INTO stores(city,location) VALUES(?,?)',
    [text(b.city,'City',60),text(b.location,'Location',255)]));
  res.status(201).json({message:'Store created'});
});
r.put('/stores/:id/manager', roles('ADMIN'), async(req,res)=>{
  const manager=int(req.body.manager_id);
  await transaction(req.user.id,async c=>{
    const [[u]]=await c.query("SELECT id FROM users WHERE id=? AND role='STORE' AND active=1",[manager]);
    if(!u) fail('Choose an active store manager');
    await c.execute('UPDATE stores SET manager_id=? WHERE id=?',[manager,int(req.params.id)]);
  });
  res.json({message:'Manager assigned'});
});
r.post('/routes', roles('ADMIN','FACTORY'), async(req,res)=>{
  const b=req.body;
  await transaction(req.user.id,c=>c.execute(
    'INSERT INTO routes(store_id,name,coverage_area,max_minutes) VALUES(?,?,?,?)',
    [int(b.store_id),text(b.name,'Route name',80),text(b.coverage_area,'Coverage',120),int(b.max_minutes)]));
  res.status(201).json({message:'Route created'});
});
r.patch('/routes/:id', roles('ADMIN','FACTORY'), async(req,res)=>{
  // Names, coverage and store links are stable historical identifiers.
  await transaction(req.user.id,c=>c.execute('UPDATE routes SET active=? WHERE id=?',
    [!!req.body.active,int(req.params.id)]));
  res.json({message:'Route availability updated'});
});
export default r;
