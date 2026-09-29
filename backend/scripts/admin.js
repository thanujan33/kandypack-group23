import 'dotenv/config';
import mysql from 'mysql2/promise';
export async function admin() {
  const c = await mysql.createConnection({
    host:process.env.DB_HOST, port:Number(process.env.DB_PORT || 3307),
    user:process.env.DB_ADMIN_USER, password:process.env.DB_ADMIN_PASSWORD,
    database:process.env.DB_NAME, dateStrings:true, decimalNumbers:true
  });
  await c.query("SET time_zone='+05:30'");
  await c.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
  return c;
}
