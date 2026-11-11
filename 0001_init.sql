CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  login_phone TEXT NOT NULL UNIQUE,
  carrier TEXT NOT NULL CHECK (carrier IN ('Vivo', 'Claro', 'TIM', 'Outra')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  gsm_phone TEXT,
  carrier TEXT,
  serial TEXT,
  elder_name TEXT,
  responsible_name TEXT,
  responsible_phone TEXT,
  address TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  phone TEXT NOT NULL,
  notify_type TEXT NOT NULL CHECK (notify_type IN ('SMS', 'SMS + chamada')),
  updated_at TEXT NOT NULL,
  UNIQUE (device_id, position),
  UNIQUE (device_id, phone)
);

CREATE TABLE IF NOT EXISTS pairing_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('primeiro_acesso', 'novo_pareamento')),
  gsm_phone TEXT NOT NULL,
  needs_pin INTEGER CHECK (needs_pin IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('em_andamento', 'comandos_solicitados', 'confirmado', 'cancelada')),
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_attempt_per_device
  ON pairing_attempts(device_id) WHERE status IN ('em_andamento', 'comandos_solicitados');

CREATE TABLE IF NOT EXISTS sms_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES pairing_attempts(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  payload_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('solicitando', 'aceito', 'falha', 'incerto')),
  twilio_sid TEXT,
  error_code INTEGER,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (attempt_id, step_key)
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS history_by_device ON history(device_id, id DESC);
