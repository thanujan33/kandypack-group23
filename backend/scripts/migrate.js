import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { admin } from './admin.js';
const c = await admin();
try {
  const [[lock]] = await c.query("SELECT GET_LOCK('kp_migrations',10) ok");
  if (!lock.ok) throw new Error('Another migration is running');
  await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(160) PRIMARY KEY, checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const dir=new URL('../db/migrations/',import.meta.url);
  for (const name of (await readdir(dir)).filter(n=>/\.(sql|js)$/.test(n)).sort()) {
    const sql=await readFile(new URL(name,dir),'utf8');
    const hash=createHash('sha256').update(sql).digest('hex');
    const lfHash=createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
    const crlfHash=createHash('sha256').update(sql.replace(/\r?\n/g,'\r\n')).digest('hex');
    const [[old]]=await c.query('SELECT checksum FROM schema_migrations WHERE name=?',[name]);
    if (old) {
      if (old.checksum!==hash && old.checksum!==lfHash && old.checksum!==crlfHash)
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    if(name.endsWith('.js')) {
      await (await import(new URL(name,dir))).up(c);
      await c.query('INSERT INTO schema_migrations(name,checksum) VALUES(?,?)',[name,hash]);
      console.log(`Applied ${name}`);continue;
    }
    // Our files use standard DELIMITER lines and one statement per delimiter.
    let delimiter=';', buffer='';
    for (const line of sql.split('\n')) {
      if (line.trim().startsWith('DELIMITER ')) {
        if (buffer.trim()) throw new Error(`Unterminated statement in ${name}`);
        delimiter=line.trim().slice(10); continue;
      }
      if (!buffer && (!line.trim() || line.trim().startsWith('--'))) continue;
      buffer+=line+'\n';
      if (buffer.trimEnd().endsWith(delimiter)) {
        await c.query(buffer.trimEnd().slice(0,-delimiter.length)); buffer='';
      }
    }
    if (buffer.trim()) throw new Error(`Unterminated statement in ${name}`);
    await c.query('INSERT INTO schema_migrations(name,checksum) VALUES(?,?)',[name,hash]);
    console.log(`Applied ${name}`);
  }
} finally { await c.query("SELECT RELEASE_LOCK('kp_migrations')"); await c.end(); }
// MySQL DDL commits implicitly. A failed migration can leave partial DDL.
// Use a fresh disposable database to retry; never blindly rerun it on shared data.
