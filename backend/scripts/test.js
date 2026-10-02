import {admin} from './admin.js';
import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
const c=await admin();
const database='kandypack_test_'+Date.now();
try{
  await c.query(`CREATE DATABASE ${database}`);
  const env={...process.env,DB_NAME:database,SEED_DEMO:'YES',DEMO_PASSWORD:'TestOnlyPassword123!'};
  for(const script of ['scripts/migrate.js','scripts/seed.js']){
    const p=spawnSync(process.execPath,[script],{env,stdio:'inherit'});
    if(p.status)throw new Error(script+' failed');
  }
  const tests=(await readdir('test')).filter(n=>n.endsWith('.test.js')).map(n=>'test/'+n);
  const p=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests],{env,stdio:'inherit'});
  if(p.status)process.exitCode=1;
}finally{
  // Only the uniquely named database created above is removed.
  await c.query(`DROP DATABASE ${database}`);await c.end();
}
