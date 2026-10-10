export function fail(message, status = 400) {
  const e = new Error(message); e.status = status; throw e;
}
export function int(value, name = 'ID') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) fail(`${name} must be a positive integer`);
  return n;
}
export function text(value, name, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(`${name} is required and must be at most ${max} characters`);
  return value.trim();
}
export function roles(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) return next(Object.assign(
      new Error('This action is not allowed for your role'), { status: 403 }));
    next();
  };
}
export function checkStore(req, store) {
  if (req.user.role === 'STORE' && Number(store) !== Number(req.user.store_id))
    fail('This record belongs to another store', 403);
}
export function datetime(value, name = 'Timestamp') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim()))
    fail(`${name} must be a valid timestamp in YYYY-MM-DD HH:MM:SS format`);
  const trimmed = value.trim();
  const [dPart, tPart] = trimmed.split(' ');
  const d = new Date(dPart + 'T' + tPart + 'Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().replace('T', ' ').slice(0, 19) !== trimmed)
    fail(`${name} must be a valid calendar date and time`);
  return trimmed;
}
