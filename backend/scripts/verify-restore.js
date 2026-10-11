import { admin } from './admin.js';

async function main() {
  const c = await admin();
  const [tables] = await c.query(`
    SELECT TABLE_NAME name 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'kandypack' AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);

  console.log('| Table Name | kandypack | kandypack_scratch_restore | Status |');
  console.log('| :--- | :---: | :---: | :---: |');

  let allMatch = true;
  for (const { name } of tables) {
    const [[orig]] = await c.query(`SELECT COUNT(*) cnt FROM kandypack.\`${name}\``);
    const [[rest]] = await c.query(`SELECT COUNT(*) cnt FROM kandypack_scratch_restore.\`${name}\``);
    const match = orig.cnt === rest.cnt;
    if (!match) allMatch = false;
    console.log(`| \`${name}\` | ${orig.cnt} | ${rest.cnt} | ${match ? 'MATCH' : 'MISMATCH'} |`);
  }

  // Routines check
  const [origRoutines] = await c.query(`SELECT COUNT(*) cnt FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'kandypack'`);
  const [restRoutines] = await c.query(`SELECT COUNT(*) cnt FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'kandypack_scratch_restore'`);
  console.log(`\nRoutines count: kandypack = ${origRoutines[0].cnt}, restore = ${restRoutines[0].cnt}`);

  // Triggers check
  const [origTriggers] = await c.query(`SELECT COUNT(*) cnt FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'kandypack'`);
  const [restTriggers] = await c.query(`SELECT COUNT(*) cnt FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'kandypack_scratch_restore'`);
  console.log(`Triggers count: kandypack = ${origTriggers[0].cnt}, restore = ${restTriggers[0].cnt}`);

  await c.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
