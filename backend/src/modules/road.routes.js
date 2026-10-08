import {Router} from 'express';
import {read,transaction,call} from '../db.js';
import {roles,int,text,checkStore,fail} from '../http.js';

const r=Router();

r.use('/road',roles('ADMIN','STORE'));

r.get('/road/resources',async(req,res)=>{
  const store=req.user.role==='STORE'
    ?req.user.store_id
    :int(req.query.store_id);

  const week=req.query.week||
    new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Colombo'
    }).format(new Date());

  res.json({
    trucks:await read(`
      SELECT t.*,
        IF(
          EXISTS(
            SELECT 1
            FROM delivery_trips d
            WHERE d.truck_id=t.id
              AND d.status='OUT'
          ),
          'ON_TRIP',
          'NOT_OUT'
        ) live_status
      FROM trucks t
      WHERE store_id=?
    `,[store||0]),

    employees:await read(`
      SELECT e.*,
        fn_work_minutes(
          e.id,
          DATE_SUB(DATE(?),INTERVAL WEEKDAY(?) DAY),
          0
        )/60 committed_hours,

        IF(role='DRIVER',40,60)
        -fn_work_minutes(
          e.id,
          DATE_SUB(DATE(?),INTERVAL WEEKDAY(?) DAY),
          0
        )/60 remaining_hours

      FROM employees e
      WHERE store_id=?
    `,[week,week,week,week,store||0])
  });
});


r.post('/road/trucks',async(req,res)=>{
  const b=req.body;
  const store=int(b.store_id);

  checkStore(req,store);

  if(!Number.isFinite(Number(b.capacity))||Number(b.capacity)<=0)
    fail('Positive capacity required');

  await transaction(req.user.id,c=>c.execute(
    'INSERT INTO trucks(store_id,plate,type,capacity) VALUES(?,?,?,?)',
    [
      store,
      text(b.plate,'Plate',30),
      text(b.type,'Truck type',60),
      Number(b.capacity)
    ]
  ));

  res.status(201).json({
    message:'Truck added'
  });
});


r.post('/road/employees',async(req,res)=>{
  const b=req.body;
  const store=int(b.store_id);

  checkStore(req,store);

  if(!['DRIVER','ASSISTANT'].includes(b.role))
    fail('Invalid employee role');

  await transaction(req.user.id,c=>c.execute(
    'INSERT INTO employees(store_id,role,name,nic,phone,email) VALUES(?,?,?,?,?,?)',
    [
      store,
      b.role,
      text(b.name,'Name',100),
      text(b.nic,'NIC',30),
      text(b.phone,'Phone',30),
      String(b.email||'').slice(0,190)
    ]
  ));

  res.status(201).json({
    message:'Employee added'
  });
});


r.patch('/road/:kind/:id/active',async(req,res)=>{
  const table={
    trucks:'trucks',
    employees:'employees'
  }[req.params.kind];

  if(!table)
    fail('Unknown resource');

  const id=int(req.params.id);

  const [row]=await read(
    `SELECT store_id FROM ${table} WHERE id=?`,
    [id]
  );

  if(!row)
    fail('Resource not found',404);

  checkStore(req,row.store_id);

  await transaction(
    req.user.id,
    c=>c.execute(
      `UPDATE ${table} SET active=? WHERE id=?`,
      [!!req.body.active,id]
    )
  );

  res.json({
    message:'Resource availability changed'
  });
});


r.get('/road/trips',async(req,res)=>res.json(
  await read(
    `SELECT
      d.*,
      r.name route,
      r.store_id,
      t.plate,
      e.name driver,
      a.name assistant,

      TIMESTAMPDIFF(
        MINUTE,
        d.actual_start,
        d.actual_end
      ) actual_minutes,

      CASE
        WHEN TIMESTAMPDIFF(
          MINUTE,
          d.actual_start,
          d.actual_end
        )>r.max_minutes
        THEN 'ROUTE_OVERRUN'
        ELSE ''
      END warning

    FROM delivery_trips d
    JOIN routes r ON r.id=d.route_id
    JOIN trucks t ON t.id=d.truck_id
    JOIN employees e ON e.id=d.driver_id
    JOIN employees a ON a.id=d.assistant_id

    ${
      req.user.role==='STORE'
        ?'WHERE r.store_id=?'
        :''
    }

    ORDER BY d.id DESC`,

    req.user.role==='STORE'
      ?[req.user.store_id||0]
      :[]
  )
));


r.get('/road/trips/:id/orders',async(req,res)=>{
  const [trip]=await read(`
    SELECT r.store_id
    FROM delivery_trips d
    JOIN routes r ON r.id=d.route_id
    WHERE d.id=?
  `,[int(req.params.id)]);

  if(!trip)
    fail('Trip not found',404);

  checkStore(req,trip.store_id);

  res.json(
    await read(
      'SELECT * FROM delivery_trip_orders WHERE trip_id=?',
      [int(req.params.id)]
    )
  );
});


r.post('/road/schedule',async(req,res)=>{
  const b=req.body;

  const [route]=await read(
    'SELECT store_id FROM routes WHERE id=?',
    [int(b.route_id)]
  );

  if(!route)
    fail('Route not found',404);

  checkStore(req,route.store_id);

  if(!Array.isArray(b.order_ids)||!b.order_ids.length)
    fail('Select orders');

  res.status(201).json(
    (
      await call(
        req.user.id,
        'sp_schedule_delivery',
        [
          int(b.route_id),
          int(b.truck_id),
          int(b.driver_id),
          int(b.assistant_id),
          text(b.planned_start,'Start',19),
          text(b.planned_end,'End',19),
          JSON.stringify(
            b.order_ids.map(x=>int(x))
          )
        ]
      )
    )[0]
  );
});


for(const action of ['dispatch','cancel','return']){

  r.post('/road/trips/:id/'+action,async(req,res)=>{
    const id=int(req.params.id);

    const [trip]=await read(`
      SELECT r.store_id
      FROM delivery_trips d
      JOIN routes r ON r.id=d.route_id
      WHERE d.id=?
    `,[id]);

    if(!trip)
      fail('Trip not found',404);

    checkStore(req,trip.store_id);

    const args=[id];

    if(action==='return'){
      if(!Array.isArray(req.body.delivered_ids))
        fail('Delivered IDs must be an array');

      args.push(
        text(
          req.body.actual_end,
          'Return time',
          19
        ),
        JSON.stringify(
          req.body.delivered_ids.map(x=>int(x))
        )
      );
    }

    res.json(
      (
        await call(
          req.user.id,
          'sp_'+action+'_delivery',
          args
        )
      )[0]
    );
  });
}

export default r;