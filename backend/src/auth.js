import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { read, transaction } from './db.js';
import { fail, text } from './http.js';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || secret.startsWith('replace-'))
  throw new Error('Set a random JWT_SECRET of at least 32 characters');
export const authRouter = Router();
function credentials(body) {
  const email = text(body.email, 'Email', 190).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Invalid email');
  const password = text(body.password, 'Password', 72);
  if (Buffer.byteLength(password, 'utf8') > 72 || password.length < 12)
    fail('Password must have 12 or more characters and at most 72 UTF-8 bytes');
  return { email, password };
}
authRouter.post('/register', async (req, res) => {
  const { email, password } = credentials(req.body);
  const hash = await bcrypt.hash(password, 12);
  await transaction(null, c => c.execute(
    `INSERT INTO users(name,email,password_hash,phone,nic,address)
     VALUES(?,?,?,?,?,?)`, [text(req.body.name, 'Name', 100), email, hash,
      text(req.body.phone, 'Phone', 30), String(req.body.nic || '').slice(0,30),
      text(req.body.address, 'Address')]));
  res.status(201).json({ message: 'Account created. Please sign in.' });
});
// Small local-demo limiter; a multi-server deployment needs shared rate limiting.
const attempts = new Map();
authRouter.post('/login', async (req, res) => {
  const key = req.ip;
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const record = attempts.get(key) || { count: 0, until: now + 600000 };
  if (record.count >= 20) fail('Too many login attempts; wait 10 minutes', 429);
  record.count++; attempts.set(key, record);
  const { email, password } = credentials(req.body);
  const [u] = await read('SELECT * FROM users WHERE email=? AND active=1', [email]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    fail('Incorrect email or password', 401);
  attempts.delete(key);
  const sid = randomUUID();
  await transaction(u.id, c => c.execute(
    `INSERT INTO sessions VALUES(?,?,NOW(),DATE_ADD(NOW(),INTERVAL 8 HOUR),0)`,
    [sid, u.id]));
  res.json({ token: jwt.sign({ sid }, secret, {
    subject: String(u.id), expiresIn: '8h', algorithm: 'HS256'
  }) });
});
export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) fail('Sign in first', 401);
    const p = jwt.verify(token, secret, { algorithms: ['HS256'] });
    const [u] = await read(
      `SELECT u.id,u.name,u.email,u.role,s.id sid,st.id store_id
       FROM sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN stores st ON st.manager_id=u.id
       WHERE s.id=? AND u.id=? AND u.active=1 AND s.revoked=0
       AND s.expires_at>NOW() AND s.last_seen>DATE_SUB(NOW(),INTERVAL 30 MINUTE)`,
      [p.sid, p.sub]);
    if (!u) fail('Session expired; sign in again', 401);
    await transaction(u.id, c => c.execute(
      'UPDATE sessions SET last_seen=NOW() WHERE id=?', [p.sid]));
    req.user = u; next();
  } catch { next(Object.assign(new Error('Session expired; sign in again'), {status:401})); }
}
