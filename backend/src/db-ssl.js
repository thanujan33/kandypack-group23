import { readFileSync } from 'node:fs';

// Local Docker connections stay unchanged unless cloud TLS is enabled.
export function databaseSSL() {
  if (process.env.DB_SSL !== 'true') return undefined;
  const ca = readFileSync(new URL('../certs/aiven-ca.pem', import.meta.url), 'utf8');
  return { ca, rejectUnauthorized: true };
}
