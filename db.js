const nowIso = () => new Date().toISOString();

export const accountByPhone = (DB, phone) =>
  DB.prepare('SELECT id, name, login_phone, carrier, password_hash FROM accounts WHERE login_phone = ?').bind(phone).first();

export const accountById = (DB, id) =>
  DB.prepare('SELECT id, name, login_phone, carrier FROM accounts WHERE id = ?').bind(id).first();

export async function ensureDevice(DB, account) {
  await DB.prepare('INSERT OR IGNORE INTO devices(account_id, carrier, updated_at) VALUES(?, ?, ?)')
    .bind(account.id, account.carrier, nowIso())
    .run();
  return DB.prepare('SELECT * FROM devices WHERE account_id = ?').bind(account.id).first();
}

export const listContacts = async (DB, deviceId) =>
  (await DB.prepare('SELECT position, name, relation, phone, notify_type FROM contacts WHERE device_id = ? ORDER BY position')
    .bind(deviceId).all()).results;

export const addHistory = (DB, deviceId, type, description) =>
  DB.prepare('INSERT INTO history(device_id, created_at, type, description) VALUES(?, ?, ?, ?)')
    .bind(deviceId, nowIso(), type, description)
    .run();

export const listHistory = async (DB, deviceId) =>
  (await DB.prepare('SELECT created_at, type, description FROM history WHERE device_id = ? ORDER BY id DESC LIMIT 50')
    .bind(deviceId).all()).results;

export const currentAttempt = (DB, device) =>
  device.gsm_phone
    ? DB.prepare("SELECT * FROM pairing_attempts WHERE device_id = ? AND gsm_phone = ? AND status != 'cancelada' ORDER BY id DESC LIMIT 1")
        .bind(device.id, device.gsm_phone).first()
    : null;

export const openAttempt = (DB, deviceId) =>
  DB.prepare("SELECT * FROM pairing_attempts WHERE device_id = ? AND status IN ('em_andamento', 'comandos_solicitados')")
    .bind(deviceId).first();

export const listSteps = async (DB, attemptId) =>
  (await DB.prepare('SELECT step_key, payload_ref, status, error_code, updated_at FROM sms_attempts WHERE attempt_id = ? ORDER BY id')
    .bind(attemptId).all()).results;
