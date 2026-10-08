import {admin} from './admin.js';
import bcrypt from 'bcryptjs';
if(process.env.SEED_DEMO!=='YES')throw new Error('Set SEED_DEMO=YES for a new local demonstration database');
if(!process.env.DEMO_PASSWORD||process.env.DEMO_PASSWORD.length<12)
  throw new Error('Set a demo password with at least 12 characters');
const c=await admin();
const insert=async(sql,args=[])=>{const [r]=await c.execute(sql,args);return r.insertId;};
const date=(base,offset)=>new Date(new Date(base+'T00:00:00Z').getTime()+offset*86400000).toISOString().slice(0,10);
try{
  const [[counts]]=await c.query('SELECT (SELECT COUNT(*) FROM orders) o,(SELECT COUNT(*) FROM stores) s');
  if(counts.o||counts.s)throw new Error('Seed requires empty orders and stores; it never erases existing data');
  const [[clock]]=await c.query('SELECT CURRENT_DATE today');
  const today=clock.today,hash=await bcrypt.hash(process.env.DEMO_PASSWORD,12);
  await c.beginTransaction();
  const addUser=(name,email,role)=>insert(`INSERT INTO users(name,email,password_hash,role,phone,address)
    VALUES(?,?,?,?,?,?)`,[name,email,hash,role,'0770000000','Synthetic demo address']);
  const adminId=await addUser('Demo administrator','admin@kandypack.test','ADMIN');
  await c.query('SET @actor=?',[adminId]);
  await addUser('Factory manager','factory@kandypack.test','FACTORY');
  const customers=[];
  for(let i=1;i<=3;i++)customers.push(await addUser('Demo customer '+i,`customer${i}@kandypack.test`,'CUSTOMER'));
  const cities=['Colombo','Negombo','Galle','Matara','Jaffna','Trincomalee'];
  const stores=[],routes=[],staff=[],trucks=[];
  for(let i=0;i<cities.length;i++){
    const city=cities[i];
    const manager=await addUser(city+' manager',`${city.toLowerCase()}@kandypack.test`,'STORE');
    const store=await insert('INSERT INTO stores(city,location,manager_id) VALUES(?,?,?)',[city,city+' station store',manager]);
    stores.push(store);
    for(let j=1;j<=2;j++)routes.push({id:await insert(
      'INSERT INTO routes(store_id,name,coverage_area,max_minutes) VALUES(?,?,?,?)',
      [store,city+' route '+j,city+' zone '+j,240]),store,index:i});
    const team={drivers:[],assistants:[]};
    for(let j=0;j<5;j++){
      const role=j<3?'DRIVER':'ASSISTANT';
      const id=await insert('INSERT INTO employees(store_id,role,name,nic,phone) VALUES(?,?,?,?,?)',
        [store,role,`${city} ${role.toLowerCase()} ${j+1}`,`DEMO-${i}-${j}`,'0770000000']);
      team[j<3?'drivers':'assistants'].push(id);
    }
    staff.push(team);
    trucks.push(await insert('INSERT INTO trucks(store_id,plate,type,capacity) VALUES(?,?,?,?)',
      [store,`DEMO-${i+1}01`,'Box truck',200]));
    await insert('INSERT INTO trucks(store_id,plate,type,capacity) VALUES(?,?,?,?)',
      [store,`DEMO-${i+1}02`,'Small truck',100]);
  }
  const products=[];
  const names=['Detergent box','Tea box','Soap carton','Biscuit carton','Rice pack','Noodle carton',
    'Milk powder box','Spice carton','Coconut oil case','Toothpaste carton','Shampoo box','Juice carton'];
  for(let i=0;i<12;i++)products.push({id:await insert('INSERT INTO products(name,unit_price,space_rate) VALUES(?,?,?)',
    [names[i],(i+1)*125,[0.5,1,0.25,0.75][i%4]]),price:(i+1)*125,space:[0.5,1,0.25,0.75][i%4]});
  for(let i=0;i<40;i++){
    const route=routes[i%12],historical=i<24,received=i<32;
    const delivery=historical?date(today,-42+i):i<32?date(today,Math.floor((i-24)/4)):date(today,7+Math.floor((i-32)/4));
    const placed=received?date(delivery,-10):today;
    const order=await insert(`INSERT INTO orders(customer_id,route_id,placed_at,delivery_date,address)
      VALUES(?,?,?,?,?)`,[customers[i%3],route.id,placed+' 08:00:00',delivery,`Demo shop ${i+1}, ${cities[route.index]} zone ${i%2+1}`]);
    const a=products[i===32?0:i%12],b=products[(i+1)%12],qa=i===32?250:5+i%4,qb=2;
    for(const [p,q] of [[a,qa],[b,qb]])await insert(
      'INSERT INTO order_items(order_id,product_id,quantity,unit_price,space_rate) VALUES(?,?,?,?,?)',
      [order,p.id,q,p.price,p.space]);
    if(received){
      const arrival=date(delivery,-1),departure=date(delivery,-2);
      const t1=await insert(`INSERT INTO train_trips(reference,store_id,departure_at,arrival_at,capacity)
        VALUES(?,?,?,?,?)`,[`HIST-${i+1}-A`,route.store,departure+' 08:00:00',arrival+' 06:00:00',i===0?2*a.space:100]);
      const t2=i===0?await insert(`INSERT INTO train_trips(reference,store_id,departure_at,arrival_at,capacity)
        VALUES(?,?,?,?,?)`,['HIST-1-B',route.store,departure+' 10:00:00',arrival+' 07:00:00',100]):t1;
      const allocations=i===0?[[t1,a,2],[t2,a,qa-2],[t2,b,qb]]:[[t1,a,qa],[t1,b,qb]];
      for(const [trip,p,q] of allocations)await insert(`INSERT INTO train_allocations
        (train_trip_id,order_id,product_id,quantity,space_rate) VALUES(?,?,?,?,?)`,[trip,order,p.id,q,p.space]);
      await c.execute("UPDATE train_trips SET status='ARRIVED' WHERE id IN(?,?)",[t1,t2]);
      await c.execute(`UPDATE train_allocations SET receipt_checked=1,received_qty=quantity,received_at=?
        WHERE order_id=?`,[arrival+' 07:30:00',order]);
      await c.query('CALL sp_refresh_order(?)',[order]);
      if(historical){
        const team=staff[route.index],start=delivery+' 09:00:00',end=delivery+' 11:00:00';
        const trip=await insert(`INSERT INTO delivery_trips(route_id,truck_id,driver_id,assistant_id,planned_start,planned_end)
          VALUES(?,?,?,?,?,?)`,[route.id,trucks[route.index],team.drivers[i%3],team.assistants[i%2],start,end]);
        await insert('INSERT INTO delivery_trip_orders(trip_id,order_id) VALUES(?,?)',[trip,order]);
        await c.execute("UPDATE delivery_trips SET status='OUT',actual_start=? WHERE id=?",[start,trip]);
        await c.execute("UPDATE delivery_trips SET status='COMPLETED',actual_end=? WHERE id=?",[end,trip]);
        await c.execute("UPDATE delivery_trip_orders SET outcome='DELIVERED' WHERE trip_id=?",[trip]);
        await c.execute("UPDATE orders SET status='DELIVERED',delivered_at=? WHERE id=?",[end,order]);
      }
    }
  }
  for(let i=0;i<6;i++)for(let j=1;j<=4;j++)await insert(`INSERT INTO train_trips
    (reference,store_id,departure_at,arrival_at,capacity) VALUES(?,?,?,?,?)`,
    [`NEXT-${i+1}-${j}`,stores[i],date(today,j)+' 06:00:00',date(today,j)+' 18:00:00',50]);
  await c.commit();
  console.log('Seeded 40 orders, 12 routes, 6 cities, 12 products, 12 trucks, 30 staff and valid rail/road details.');
  console.log('Accounts: admin@kandypack.test, factory@kandypack.test, customer1@kandypack.test, colombo@kandypack.test.');
  console.log('All demo accounts use your DEMO_PASSWORD. Historical dates are imported by this root-only fixture script.');
}catch(e){await c.rollback();throw e;}finally{await c.end();}