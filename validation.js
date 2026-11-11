export const CARRIERS = ['Vivo', 'Claro', 'TIM', 'Outra'];
export const NOTIFY_TYPES = ['SMS', 'SMS + chamada'];

export const digits = value => String(value ?? '').replace(/\D/g, '');

export function normalizeMobile(value) {
  const d = digits(value);
  return /^[1-9][1-9]9\d{8}$/.test(d) ? d : null;
}

export function formatMobile(d) {
  return d && d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : '';
}

export function cleanText(value, { max, required = false, multiline = false }) {
  const raw = value === undefined || value === null ? '' : value;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (required && !text) return null;
  if (text.length > max) return null;
  const forbidden = multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  return forbidden.test(text) ? null : text;
}

export const validPin = value => typeof value === 'string' && /^\d{4,8}$/.test(value);
export const validPosition = n => Number.isInteger(n) && n >= 1 && n <= 10;
export const validSerial = value => typeof value === 'string' && /^[A-Za-z0-9._-]{0,40}$/.test(value);
