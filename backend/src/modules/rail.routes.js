import {Router} from 'express';
import {read,transaction,call} from '../db.js';
import {roles,int,text,fail,checkStore} from '../http.js';
const r=Router();
r.get('/trains',roles('ADMIN','FACTORY','STORE'),async(req,res)=>res.json(await read(
  `SELECT t.*,s.city FROM v_train_capacity t JOIN stores s ON s.id=t.store_id
   ${req.user.role==='STORE'?'WHERE t.store_id=?':''} ORDER BY t.departure_at DESC`,
  req.user.role==='STORE'?[req.user.store_id||0]:[])));
function trainValues(b){
  if(!Number.isFinite(Number(b.capacity))||Number(b.capacity)<=0)fail('Capacity must be positive');
  return [text(b.reference,'Reference',80),int(b.store_id),text(b.departure_at,'Departure',19),
    text(b.arrival_at,'Arrival',19),Number(b.capacity)];
}
r.post('/trains',roles('ADMIN','FACTORY'),async(req,res)=>{
  await transaction(req.user.id,c=>c.execute(`INSERT INTO train_trips
    (reference,store_id,departure_at,arrival_at,capacity) VALUES(?,?,?,?,?)`,trainValues(req.body)));
  res.status(201).json({message:'Train added'});
});
r.put('/trains/:id',roles('ADMIN','FACTORY'),async(req,res)=>{
  await transaction(req.user.id,c=>c.execute(`UPDATE train_trips SET
    reference=?,store_id=?,departure_at=?,arrival_at=?,capacity=? WHERE id=? AND status='SCHEDULED'`,
    [...trainValues(req.body),int(req.params.id)]));
  res.json({message:'Unallocated train updated'});
});
r.post('/rail/allocate',roles('ADMIN','FACTORY'),async(req,res)=>res.json(
  (await call(req.user.id,'sp_allocate_order',[int(req.body.order_id),int(req.body.train_trip_id)]))[0]));
r.post('/trains/:id/dispatch',roles('ADMIN','FACTORY'),async(req,res)=>res.json(
  (await call(req.user.id,'sp_dispatch_train',[int(req.params.id)]))[0]));
r.get('/rail/manifest',roles('ADMIN','FACTORY','STORE'),async(req,res)=>res.json(await read(
  `SELECT a.*,t.reference,t.store_id,t.departure_at,t.arrival_at,t.status train_status,
    p.name product,u.name customer FROM train_allocations a
    JOIN train_trips t ON t.id=a.train_trip_id JOIN products p ON p.id=a.product_id
    JOIN orders o ON o.id=a.order_id JOIN users u ON u.id=o.customer_id
    ${req.user.role==='STORE'?'WHERE t.store_id=?':''} ORDER BY a.id DESC`,
  req.user.role==='STORE'?[req.user.store_id||0]:[])));
r.post('/rail/receive',roles('ADMIN','STORE'),async(req,res)=>{
  const [a]=await read(`SELECT t.store_id FROM train_allocations a JOIN train_trips t
    ON t.id=a.train_trip_id WHERE a.id=?`,[int(req.body.allocation_id)]);
  if(!a)fail('Allocation not found',404); checkStore(req,a.store_id);
  const q=Number(req.body.received_qty);
  if(!Number.isSafeInteger(q)||q<0)fail('Received quantity must be a nonnegative integer');
  res.json((await call(req.user.id,'sp_receive_allocation',[int(req.body.allocation_id),a.store_id,q]))[0]);
});
export default r;
