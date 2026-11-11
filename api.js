import * as auth from './auth.js';
import * as db from './db.js';
import * as pairing from './pairing.js';
import { HttpError, isUnique } from './errors.js';
import { sendSms } from './twilio.js';
import { CARRIERS, NOTIFY_TYPES, cleanText, formatMobile, normalizeMobile, validPosition, validSerial } from './validation.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
const fail = (status, error, message, extra = {}) => json({ error, message, ...extra }, status);
const bad = message => new HttpError(400, 'INVALID', message);

async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('Formato de requisição inválido.');
  const text = await request.text();
  if (text.length > 20000) throw bad('Requisição grande demais.');
  try {
    const data = JSON.parse(text || '{}');
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('formato');
    return data;
  } catch {
    throw bad('Requisição inválida.');
  }
}

async function buildState(env, accountId) {
  const DB = env.DB;
  const account = await db.accountById(DB, accountId);
  const device = await db.ensureDevice(DB, account);
  const [contacts, history, attempt] = await Promise.all([
    db.listContacts(DB, device.id),
    db.listHistory(DB, device.id),
    db.currentAttempt(DB, device)
  ]);
  const steps = attempt ? await db.listSteps(DB, attempt.id) : [];
  return {
    account: { name: account.name, phone: formatMobile(account.login_phone), carrier: account.carrier },
    device: {
      gsm: formatMobile(device.gsm_phone),
      operator: device.carrier || account.carrier,
      serial: device.serial || '',
      elderName: device.elder_name || '',
      respName: device.responsible_name || '',
      respPhone: formatMobile(device.responsible_phone),
      address: device.address || '',
      notes: device.notes || ''
    },
    contacts: contacts.map(c => ({
      position: c.position,
      name: c.name,
      relation: c.relation,
      phone: formatMobile(c.phone),
      type: c.notify_type,
      commandState: pairing.contactState(c, steps)
    })),
    history: history.map(h => ({ when: h.created_at, type: h.type, text: h.description })),
    pairing: pairing.view(attempt, steps),
    smsEnabled: pairing.smsEnabled(env)
  };
}

async function login(request, env) {
  const body = await readJson(request);
  const phone = normalizeMobile(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!phone || !password || password.length > 200) throw bad('Informe um celular válido com DDD e a senha.');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const allowed = (await auth.rateLimit(env.DB, `login-ip:${ip}`, 30, 900)) && (await auth.rateLimit(env.DB, `login:${phone}`, 5, 900));
  if (!allowed) throw new HttpError(429, 'RATE_LIMIT', 'Muitas tentativas de login. Aguarde alguns minutos.');
  const account = await db.accountByPhone(env.DB, phone);
  const valid = await auth.verifyPassword(password, account ? account.password_hash : auth.DUMMY_HASH);
  if (!account || !valid) throw new HttpError(401, 'BAD_CREDENTIALS', 'Celular ou senha incorretos.');
  const token = await auth.createSession(env.DB, account.id);
  return json(await buildState(env, account.id), 200, { 'Set-Cookie': auth.sessionCookie(token) });
}

async function saveDevice(ctx, request) {
  const body = await readJson(request);
  const gsm = normalizeMobile(body.gsm);
  const respPhone = normalizeMobile(body.respPhone);
  const operator = CARRIERS.includes(body.operator) ? body.operator : null;
  const elderName = cleanText(body.elderName, { max: 100, required: true });
  const respName = cleanText(body.respName, { max: 100, required: true });
  const address = cleanText(body.address, { max: 200 });
  const notes = cleanText(body.notes, { max: 500, multiline: true });
  const serial = typeof body.serial === 'string' ? body.serial.trim() : '';
  if (!gsm || !respPhone) throw bad('Confira os celulares do chip e do responsável. Informe DDD + 9 dígitos.');
  if (!operator || !elderName || !respName || address === null || notes === null) throw bad('Confira os campos obrigatórios e os tamanhos dos textos.');
  if (!validSerial(serial)) throw bad('O código de série aceita letras, números, ponto, hífen e sublinhado (até 40).');
  const { DB, device } = ctx;
  if (gsm !== device.gsm_phone) {
    await DB.prepare("UPDATE pairing_attempts SET status = 'cancelada' WHERE device_id = ? AND status IN ('em_andamento', 'comandos_solicitados')").bind(device.id).run();
  }
  await DB.prepare('UPDATE devices SET gsm_phone = ?, carrier = ?, serial = ?, elder_name = ?, responsible_name = ?, responsible_phone = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(gsm, operator, serial || null, elderName, respName, respPhone, address, notes, new Date().toISOString(), device.id).run();
  await db.addHistory(DB, device.id, 'DADOS_ATUALIZADOS', 'Dados do dispositivo e do idoso atualizados.');
}

function contactFields(body) {
  const name = cleanText(body.name, { max: 80, required: true });
  const relation = cleanText(body.relation, { max: 60, required: true });
  const phone = normalizeMobile(body.phone);
  const type = NOTIFY_TYPES.includes(body.type) ? body.type : null;
  if (!name || !relation || !phone || !type) throw bad('Preencha nome, vínculo e um celular válido com DDD.');
  return { name, relation, phone, type };
}

const duplicatePhone = () => new HttpError(409, 'DUPLICATE_PHONE', 'Este celular já está cadastrado em outro contato.');

async function addContact(ctx, request) {
  const fields = contactFields(await readJson(request));
  const { DB, device } = ctx;
  const used = new Set((await db.listContacts(DB, device.id)).map(c => c.position));
  let position = 1;
  while (used.has(position)) position++;
  if (!validPosition(position)) throw new HttpError(409, 'FULL', 'Limite de 10 contatos atingido.');
  try {
    await DB.prepare('INSERT INTO contacts(device_id, position, name, relation, phone, notify_type, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .bind(device.id, position, fields.name, fields.relation, fields.phone, fields.type, new Date().toISOString()).run();
  } catch (error) {
    if (isUnique(error)) throw /phone/.test(error.message) ? duplicatePhone() : new HttpError(409, 'CONFLICT', 'Não foi possível salvar. Tente novamente.');
    throw error;
  }
  await db.addHistory(DB, device.id, 'CONTATO_INCLUIDO', `Contato ${position} incluído.`);
}

async function updateContact(ctx, request, position) {
  const fields = contactFields(await readJson(request));
  const { DB, device } = ctx;
  try {
    const result = await DB.prepare('UPDATE contacts SET name = ?, relation = ?, phone = ?, notify_type = ?, updated_at = ? WHERE device_id = ? AND position = ?')
      .bind(fields.name, fields.relation, fields.phone, fields.type, new Date().toISOString(), device.id, position).run();
    if (result.meta.changes !== 1) throw new HttpError(404, 'NOT_FOUND', 'Contato não encontrado.');
  } catch (error) {
    if (isUnique(error)) throw duplicatePhone();
    throw error;
  }
  await db.addHistory(DB, device.id, 'CONTATO_ALTERADO', `Contato ${position} alterado.`);
}

async function deleteContact(ctx, position) {
  if (position <= 3) throw new HttpError(409, 'MANDATORY', 'É necessário manter pelo menos três contatos.');
  const { DB, device } = ctx;
  const result = await DB.prepare('DELETE FROM contacts WHERE device_id = ? AND position = ?').bind(device.id, position).run();
  if (result.meta.changes !== 1) throw new HttpError(404, 'NOT_FOUND', 'Contato não encontrado.');
  await db.addHistory(DB, device.id, 'CONTATO_EXCLUIDO', `Contato ${position} excluído.`);
}

export async function handleApi(request, env, url) {
  try {
    if (!env.DB) throw new HttpError(500, 'CONFIG', 'Banco de dados não configurado.');
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method;
    if (path === '/api/health' && method === 'GET') {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true });
    }
    if (method !== 'GET' && !auth.sameOriginRequest(request, url)) throw new HttpError(403, 'FORBIDDEN', 'Requisição não permitida.');
    if (path === '/api/login' && method === 'POST') return await login(request, env);
    if (path === '/api/logout' && method === 'POST') {
      await auth.destroySession(env.DB, request);
      return json({ ok: true }, 200, { 'Set-Cookie': auth.clearedCookie });
    }
    const session = await auth.getSession(env.DB, request);
    if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão ausente ou expirada.');
    if (path === '/api/state' && method === 'GET') return json(await buildState(env, session.accountId));
    const account = await db.accountById(env.DB, session.accountId);
    const device = await db.ensureDevice(env.DB, account);
    const ctx = { env, DB: env.DB, account, device, send: sendSms };
    const contactRoute = /^\/api\/contacts(?:\/(\d+))?$/.exec(path);
    let handled = true;
    if (path === '/api/device' && method === 'PUT') await saveDevice(ctx, request);
    else if (contactRoute && !contactRoute[1] && method === 'POST') await addContact(ctx, request);
    else if (contactRoute && contactRoute[1] && ['PUT', 'DELETE'].includes(method)) {
      const position = Number(contactRoute[1]);
      if (!validPosition(position)) throw new HttpError(404, 'NOT_FOUND', 'Contato não encontrado.');
      if (method === 'PUT') await updateContact(ctx, request, position);
      else await deleteContact(ctx, position);
    } else if (method === 'POST' && path.startsWith('/api/pairing/')) {
      const action = path.slice('/api/pairing/'.length);
      const body = action === 'confirm' || action === 'cancel' ? {} : await readJson(request);
      const input = { ...body, confirmRetry: body.confirmRetry === true };
      if (action === 'start') await pairing.start(ctx, input);
      else if (action === 'pin') await pairing.sendPin(ctx, input);
      else if (action === 'contacts') await pairing.sendContacts(ctx, input);
      else if (action === 'restart') await pairing.restart(ctx, input);
      else if (action === 'confirm') await pairing.confirm(ctx);
      else if (action === 'cancel') await pairing.cancel(ctx);
      else handled = false;
    } else handled = false;
    if (!handled) throw new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.');
    return json({ ok: true, state: await buildState(env, session.accountId) });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.code, error.message, error.extra);
    console.error('erro interno', error && error.name);
    return fail(500, 'INTERNAL', 'Erro interno. Tente novamente.');
  }
}
