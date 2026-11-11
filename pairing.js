import * as db from './db.js';
import { HttpError, isUnique } from './errors.js';
import { KEYS, buildCommand, commands, contactKey, stepLabel, twilioDestination } from './protocol.js';
import { rateLimit } from './auth.js';
import { validPin } from './validation.js';

const now = () => new Date().toISOString();
export const smsEnabled = env => env.SMS_ENABLED === 'true';
const hasCredentials = env => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
const stepMap = steps => new Map(steps.map(s => [s.step_key, s]));
const accepted = (map, key) => map.get(key)?.status === 'aceito';

export function contactState(contact, steps) {
  const step = steps.find(s => s.step_key === `CONTATO_${contact.position}`);
  if (!step || step.payload_ref !== contact.phone) return 'salvo';
  return { aceito: 'solicitado', falha: 'falha', incerto: 'incerto', solicitando: 'enviando' }[step.status] || 'salvo';
}

export function view(attempt, steps) {
  if (!attempt) {
    return { status: 'nao_configurado', kind: null, needsPin: null, confirmedAt: null, open: false, next: 'start', steps: [] };
  }
  const map = stepMap(steps);
  const base = {
    kind: attempt.kind,
    needsPin: attempt.needs_pin === null ? null : attempt.needs_pin === 1,
    confirmedAt: attempt.confirmed_at,
    open: attempt.status === 'em_andamento' || attempt.status === 'comandos_solicitados',
    steps: steps.map(s => ({ key: s.step_key, label: stepLabel(s.step_key), status: s.status }))
  };
  if (attempt.status === 'confirmado') return { ...base, status: 'confirmado', next: 'done' };
  if (attempt.status === 'comandos_solicitados') return { ...base, status: 'comandos_solicitados', next: 'confirm' };
  let next;
  if (attempt.kind === 'primeiro_acesso') {
    if (!accepted(map, 'PRECISA_DE_PIN')) next = 'start';
    else if (attempt.needs_pin === 1 && !accepted(map, 'PRONTO_PIN')) next = 'pin';
    else next = 'contacts';
  } else {
    next = accepted(map, 'PAREAR') ? 'contacts' : 'restart';
  }
  const problem = steps.some(s => s.status === 'falha' || s.status === 'incerto');
  return { ...base, status: problem ? 'incompleta' : 'em_andamento', next };
}

function requireGsm(ctx) {
  if (!ctx.device.gsm_phone) {
    throw new HttpError(400, 'NO_GSM', 'Salve primeiro o número do chip GSM na aba Dispositivo e idoso.');
  }
}

async function gate(ctx, plan) {
  const { env, DB, device } = ctx;
  if (!smsEnabled(env)) {
    await db.addHistory(DB, device.id, 'ENVIO_DESATIVADO', 'Solicitação de envio não executada: SMS desativado. Nenhuma mensagem foi enviada.');
    throw new HttpError(
      503,
      'SMS_DISABLED',
      'O envio de SMS está desativado. Nenhuma mensagem foi enviada e a configuração não avançou.',
      { preview: plan.map(s => ({ label: s.label, body: s.preview })) }
    );
  }
  if (!hasCredentials(env)) {
    throw new HttpError(503, 'SMS_MISCONFIGURED', 'O envio de SMS está ativado, mas a configuração do Twilio está incompleta. Nada foi enviado.');
  }
  if (!(await rateLimit(DB, `send:${device.id}`, 60, 3600))) {
    throw new HttpError(429, 'RATE_LIMIT', 'Muitas solicitações de envio. Tente novamente mais tarde.');
  }
}

const conflict = () => new HttpError(409, 'IN_PROGRESS', 'Já existe um envio em andamento para esta etapa.');

async function runStep(ctx, attemptId, step, confirmRetry) {
  const { DB, env, device } = ctx;
  const ref = step.ref ?? null;
  let row = await DB.prepare('SELECT * FROM sms_attempts WHERE attempt_id = ? AND step_key = ?').bind(attemptId, step.key).first();
  if (row && row.status === 'solicitando' && Date.now() - Date.parse(row.updated_at) > 60000) {
    await DB.prepare("UPDATE sms_attempts SET status = 'incerto', updated_at = ? WHERE id = ? AND status = 'solicitando'").bind(now(), row.id).run();
    row = { ...row, status: 'incerto' };
  }
  if (row && row.status === 'aceito' && row.payload_ref === ref) return 'aceito';
  if (row && row.status === 'solicitando') throw conflict();
  if (row && row.status === 'incerto' && !confirmRetry) return 'bloqueado';
  let rowId;
  if (!row) {
    try {
      const inserted = await DB.prepare("INSERT INTO sms_attempts(attempt_id, step_key, payload_ref, status, created_at, updated_at) VALUES(?, ?, ?, 'solicitando', ?, ?)")
        .bind(attemptId, step.key, ref, now(), now()).run();
      rowId = inserted.meta.last_row_id;
    } catch (error) {
      if (isUnique(error)) throw conflict();
      throw error;
    }
  } else {
    const updated = await DB.prepare("UPDATE sms_attempts SET status = 'solicitando', payload_ref = ?, twilio_sid = NULL, error_code = NULL, error_text = NULL, updated_at = ? WHERE id = ? AND status = ?")
      .bind(ref, now(), row.id, row.status).run();
    if (updated.meta.changes !== 1) throw conflict();
    rowId = row.id;
  }
  const result = await ctx.send(env, twilioDestination(device.gsm_phone), step.body);
  await DB.prepare('UPDATE sms_attempts SET status = ?, twilio_sid = ?, error_code = ?, error_text = ?, updated_at = ? WHERE id = ?')
    .bind(result.outcome, result.sid, result.errorCode, result.errorText, now(), rowId).run();
  const historyType = { aceito: 'ENVIO_SOLICITADO', falha: 'ENVIO_FALHOU', incerto: 'ENVIO_INCERTO' }[result.outcome];
  const historyText = {
    aceito: `Comando "${step.label}" aceito pelo Twilio (entrega ao dispositivo não confirmada).`,
    falha: `Comando "${step.label}" recusado pelo Twilio.`,
    incerto: `Comando "${step.label}" com resultado incerto: pode ter sido enviado.`
  }[result.outcome];
  await db.addHistory(DB, device.id, historyType, historyText);
  return result.outcome;
}

async function runSteps(ctx, attemptId, plan, confirmRetry) {
  for (const step of plan) {
    const outcome = await runStep(ctx, attemptId, step, confirmRetry);
    if (outcome === 'aceito') continue;
    if (outcome === 'falha') {
      throw new HttpError(502, 'SEND_FAILED', `O Twilio recusou a etapa "${step.label}". As etapas seguintes não foram enviadas.`);
    }
    throw new HttpError(
      502,
      'SEND_UNCERTAIN',
      `Não foi possível confirmar se a etapa "${step.label}" foi aceita; ela pode ter sido enviada. As etapas seguintes não foram enviadas. Confira antes de tentar de novo.`,
      { canRetry: true }
    );
  }
}

async function createAttempt(ctx, kind, needsPin) {
  const { DB, device } = ctx;
  try {
    const results = await DB.batch([
      DB.prepare("UPDATE pairing_attempts SET status = 'cancelada' WHERE device_id = ? AND status = 'comandos_solicitados'").bind(device.id),
      DB.prepare("INSERT INTO pairing_attempts(device_id, kind, gsm_phone, needs_pin, status, created_at) VALUES(?, ?, ?, ?, 'em_andamento', ?)")
        .bind(device.id, kind, device.gsm_phone, needsPin, now())
    ]);
    return results[1].meta.last_row_id;
  } catch (error) {
    if (isUnique(error)) throw new HttpError(409, 'ALREADY_OPEN', 'Já existe um pareamento em andamento para este dispositivo.');
    throw error;
  }
}

async function requireOpen(ctx, status) {
  const attempt = await db.openAttempt(ctx.DB, ctx.device.id);
  if (!attempt) throw new HttpError(409, 'NO_ATTEMPT', 'Não há pareamento em andamento.');
  if (status && attempt.status !== status) throw new HttpError(409, 'WRONG_STEP', 'Esta ação não está disponível na etapa atual.');
  return attempt;
}

export async function start(ctx, { needsPin, confirmRetry }) {
  if (typeof needsPin !== 'boolean') throw new HttpError(400, 'INVALID', 'Informe se o dispositivo precisa de PIN.');
  requireGsm(ctx);
  const { DB, device } = ctx;
  const open = await db.openAttempt(DB, device.id);
  let reuse = null;
  if (open) {
    const map = stepMap(await db.listSteps(DB, open.id));
    if (open.kind === 'primeiro_acesso' && open.status === 'em_andamento' && !accepted(map, 'PRECISA_DE_PIN')) reuse = open;
    else throw new HttpError(409, 'ALREADY_OPEN', 'Já existe um pareamento em andamento para este dispositivo.');
  } else {
    const current = await db.currentAttempt(DB, device);
    if (current && current.status === 'confirmado') {
      throw new HttpError(409, 'ALREADY_PAIRED', 'Este dispositivo já foi pareado. Use "Parear novamente".');
    }
  }
  const body = commands.precisaDePin(needsPin);
  const plan = [{ key: 'PRECISA_DE_PIN', label: KEYS.PRECISA_DE_PIN, ref: needsPin ? 'SIM' : 'NAO', body, preview: body }];
  await gate(ctx, plan);
  let attemptId;
  if (reuse) {
    attemptId = reuse.id;
    await DB.prepare('UPDATE pairing_attempts SET needs_pin = ? WHERE id = ?').bind(needsPin ? 1 : 0, attemptId).run();
  } else {
    attemptId = await createAttempt(ctx, 'primeiro_acesso', needsPin ? 1 : 0);
    await db.addHistory(DB, device.id, 'CONFIG_INICIADA', 'Configuração do dispositivo iniciada.');
  }
  await runSteps(ctx, attemptId, plan, confirmRetry);
}

export async function sendPin(ctx, { pin, confirmRetry }) {
  if (!validPin(pin)) throw new HttpError(400, 'INVALID', 'Informe o PIN com 4 a 8 dígitos.');
  requireGsm(ctx);
  const attempt = await requireOpen(ctx, 'em_andamento');
  const map = stepMap(await db.listSteps(ctx.DB, attempt.id));
  if (attempt.kind !== 'primeiro_acesso' || attempt.needs_pin !== 1 || !accepted(map, 'PRECISA_DE_PIN')) {
    throw new HttpError(409, 'WRONG_STEP', 'Esta ação não está disponível na etapa atual.');
  }
  const plan = [
    { key: 'PIN', label: KEYS.PIN, ref: null, body: commands.pin(pin), preview: buildCommand(KEYS.PIN, '*'.repeat(pin.length)) },
    { key: 'PRONTO_PIN', label: KEYS.PRONTO_PIN, ref: null, body: commands.prontoPin(), preview: commands.prontoPin() }
  ];
  await gate(ctx, plan);
  await runSteps(ctx, attempt.id, plan, confirmRetry);
}

export async function sendContacts(ctx, { confirmRetry }) {
  requireGsm(ctx);
  const { DB, device } = ctx;
  const attempt = await requireOpen(ctx, 'em_andamento');
  const steps = await db.listSteps(DB, attempt.id);
  if (view(attempt, steps).next !== 'contacts') throw new HttpError(409, 'WRONG_STEP', 'Esta ação não está disponível na etapa atual.');
  const contacts = await db.listContacts(DB, device.id);
  const positions = new Set(contacts.map(c => c.position));
  if (![1, 2, 3].every(p => positions.has(p))) {
    throw new HttpError(400, 'MIN_CONTACTS', 'Cadastre ao menos os contatos 1, 2 e 3 antes de enviar.');
  }
  const plan = contacts.map(c => {
    const body = commands.contato(c.position, c.phone);
    return { key: `CONTATO_${c.position}`, label: contactKey(c.position), ref: c.phone, body, preview: body };
  });
  const final = commands.prontoContatos();
  plan.push({ key: 'PRONTO_CONTATOS', label: KEYS.PRONTO_CONTATOS, ref: null, body: final, preview: final });
  await gate(ctx, plan);
  await runSteps(ctx, attempt.id, plan, confirmRetry);
  const done = await DB.prepare("UPDATE pairing_attempts SET status = 'comandos_solicitados' WHERE id = ? AND status = 'em_andamento'").bind(attempt.id).run();
  if (done.meta.changes === 1) {
    await db.addHistory(DB, device.id, 'ENVIO_SOLICITADO', 'Todos os comandos de configuração foram aceitos pelo Twilio. Aguardando confirmação do usuário.');
  }
}

export async function restart(ctx, { confirmRetry }) {
  requireGsm(ctx);
  const { DB, device } = ctx;
  const open = await db.openAttempt(DB, device.id);
  let reuse = null;
  if (open) {
    const map = stepMap(await db.listSteps(DB, open.id));
    if (open.kind === 'novo_pareamento' && open.status === 'em_andamento' && !accepted(map, 'PAREAR')) reuse = open;
    else if (open.status !== 'comandos_solicitados') {
      throw new HttpError(409, 'ALREADY_OPEN', 'Cancele a configuração em andamento antes de parear novamente.');
    }
  } else {
    const current = await db.currentAttempt(DB, device);
    if (!current || current.status !== 'confirmado') {
      throw new HttpError(409, 'NOT_PAIRED', 'Ainda não há pareamento confirmado para repetir. Faça o primeiro acesso.');
    }
  }
  const body = commands.parear();
  const plan = [{ key: 'PAREAR', label: KEYS.PAREAR, ref: null, body, preview: body }];
  await gate(ctx, plan);
  let attemptId;
  if (reuse) attemptId = reuse.id;
  else {
    attemptId = await createAttempt(ctx, 'novo_pareamento', null);
    await db.addHistory(DB, device.id, 'NOVO_PAREAMENTO', 'Novo pareamento iniciado.');
  }
  await runSteps(ctx, attemptId, plan, confirmRetry);
}

export async function confirm(ctx) {
  const attempt = await requireOpen(ctx, 'comandos_solicitados');
  const result = await ctx.DB.prepare("UPDATE pairing_attempts SET status = 'confirmado', confirmed_at = ? WHERE id = ? AND status = 'comandos_solicitados'")
    .bind(now(), attempt.id).run();
  if (result.meta.changes !== 1) throw new HttpError(409, 'WRONG_STEP', 'Esta confirmação já foi registrada.');
  await db.addHistory(ctx.DB, ctx.device.id, 'CONFIRMACAO_MANUAL', 'Pareamento confirmado pelo usuário.');
}

export async function cancel(ctx) {
  const attempt = await requireOpen(ctx);
  const result = await ctx.DB.prepare("UPDATE pairing_attempts SET status = 'cancelada' WHERE id = ? AND status IN ('em_andamento', 'comandos_solicitados')")
    .bind(attempt.id).run();
  if (result.meta.changes === 1) await db.addHistory(ctx.DB, ctx.device.id, 'PAREAMENTO_CANCELADO', 'Pareamento em andamento cancelado.');
}
