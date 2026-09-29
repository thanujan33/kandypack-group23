import express from 'express';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authRouter, authenticate } from './auth.js';
import { read, transaction } from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', async (req,res) => {
  await read('SELECT 1'); res.json({status:'ok'});
});
app.use('/api/auth', authRouter);
app.use('/api', authenticate);
app.get('/api/me', (req,res) => res.json(req.user));
app.post('/api/logout', async (req,res) => {
  await transaction(req.user.id, c => c.execute(
    'UPDATE sessions SET revoked=1 WHERE id=?', [req.user.sid]));
  res.json({message:'Signed out'});
});
const moduleDir = fileURLToPath(new URL('./modules/', import.meta.url));
for (const name of (await readdir(moduleDir)).sort()) {
  if (name.endsWith('.routes.js')) {
    const { default: router } = await import(pathToFileURL(path.join(moduleDir,name)));
    app.use('/api', router);
  }
}
app.use('/api', (req,res) => res.status(404).json({error:'API route not found'}));
app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
app.use((err,req,res,next) => {
  const status = err.status || (err.sqlState === '45000' ? 409 :
    ['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_CHECK_CONSTRAINT_VIOLATED',
     'ER_TRUNCATED_WRONG_VALUE','WARN_DATA_TRUNCATED'].includes(err.code) ? 400 : 500);
  if (status === 500) console.error(err);
  const message = err.sqlState === '45000' ? err.sqlMessage :
    err.code === 'ER_DUP_ENTRY' ? 'This record already exists' :
    status === 500 ? 'Server error. Check the backend terminal.' : err.message;
  res.status(status).json({error:message});
});
app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1',
  () => console.log('KandyPack API: http://localhost:3000'));
