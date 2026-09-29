import { admin } from './admin.js';
const c=await admin();
try {
  if (process.env.DB_NAME!=='kandypack' || process.env.DB_USER!=='kp_app')
    throw new Error('This demo provisioning script expects kandypack and kp_app');
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.length<12)
    throw new Error('Set DB_PASSWORD with at least 12 characters');
  await c.query("CREATE USER IF NOT EXISTS 'kp_app'@'%' IDENTIFIED BY ?",[process.env.DB_PASSWORD]);
  await c.query("ALTER USER 'kp_app'@'%' IDENTIFIED BY ?",[process.env.DB_PASSWORD]);
  await c.query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kp_app'@'%'");
  await c.query("GRANT SELECT ON kandypack.* TO 'kp_app'@'%'");
  const [tables]=await c.query('SHOW TABLES');
  const names=new Set(tables.map(t=>Object.values(t)[0]));
  for (const name of ['users','sessions','stores','routes','products','train_trips','trucks','employees'])
    if (names.has(name)) await c.query(
      `GRANT INSERT, UPDATE ON kandypack.${name} TO 'kp_app'@'%'`);
  const [routines]=await c.query(`SELECT ROUTINE_NAME name FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA='kandypack'`);
  const present=new Set(routines.map(r=>r.name));
  for(const name of ['sp_place_order','sp_allocate_order','sp_dispatch_train','sp_receive_allocation',
    'sp_schedule_delivery','sp_dispatch_delivery','sp_cancel_delivery','sp_return_delivery'])
    if(present.has(name))await c.query(`GRANT EXECUTE ON PROCEDURE kandypack.${name} TO 'kp_app'@'%'`);
  if(present.has('fn_work_minutes')) await c.query(
    "GRANT EXECUTE ON FUNCTION kandypack.fn_work_minutes TO 'kp_app'@'%'");
  console.log('Runtime grants ready; business transactions use stored procedures');
} finally { await c.end(); }
