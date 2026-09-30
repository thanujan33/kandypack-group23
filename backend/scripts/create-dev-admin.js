import bcrypt from 'bcryptjs';
import { admin } from './admin.js';

const email = 'dev1-admin@kandypack.test';
const password = process.env.DEMO_PASSWORD;

if (
  !password ||
  password.startsWith('change-') ||
  password === 'your-chosen-test-password' ||
  password.length < 12 ||
  Buffer.byteLength(password, 'utf8') > 72
) {
  throw new Error('Set a valid DEMO_PASSWORD in backend/.env first.');
}

const connection = await admin();

try {
  const [existing] = await connection.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );

  if (existing.length > 0) {
    throw new Error('This admin test email already exists. No changes made.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await connection.execute(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, ?)`,
    ['Dev1 Test Admin', email, passwordHash, 'ADMIN']
  );

  console.log(`Created local ADMIN test account: ${email}`);
} finally {
  await connection.end();
}