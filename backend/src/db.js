import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 8,
  dateStrings: true, decimalNumbers: true, multipleStatements: false
});

export async function connection(actor, work) {
  const c = await pool.getConnection();
  try {
    await c.query("SET time_zone='+05:30'");
    await c.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.query('SET @actor = ?', [actor ?? null]);
    return await work(c);
  } finally {
    // Clear connection-local audit context before reusing the pooled connection.
    await c.query('SET @actor = NULL');
    c.release();
  }
}
export async function read(sql, args = []) {
  return connection(null, async c => (await c.execute(sql, args))[0]);
}
export async function transaction(actor, work) {
  return connection(actor, async c => {
    await c.beginTransaction();
    try {
      const value = await work(c);
      await c.commit();
      return value;
    } catch (e) { await c.rollback(); throw e; }
  });
}
export async function call(actor, procedure, args) {
  // Names are constants in source code, never values received from a browser.
  if (!/^sp_[a-z_]+$/.test(procedure)) throw new Error('Invalid procedure');
  return connection(actor, async c => {
    const [sets] = await c.query(
      `CALL ${procedure}(${args.map(() => '?').join(',')})`, args);
    return sets[0] || [];
  });
}
