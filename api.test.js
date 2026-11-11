import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/auth.js';
import { createD1 } from './d1.js';

const PASSWORD = 'senha-de-teste-123';
const PIN = '4821';
const GSM = '11900000099';
const CONTACTS = ['11900000001', '11900000002', '11900000003'];
const realFetch = globalThis.fetch;

async function setup({ sms = false } = {}) {
  const DB = createD1();
  const env = {
    DB,
    SMS_ENABLED: sms ? 'true' : 'false',
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'token-de-teste',
    TWILIO_FROM_NUMBER: '+15550000000',
    ASSETS: { fetch: async () => new Response('asset') }
  };
  const hash = await hashPassword(PASSWORD);
  await DB.prepare('INSERT INTO accounts(name, login_phone, carrier, password_hash) VALUES(?, ?, ?, ?)').bind('Conta A', '11911111111', 'Vivo', hash).run();
  await DB.prepare('INSERT INTO accounts(name, login_phone, carrier, password_hash) VALUES(?, ?, ?, ?)').bind('Conta B', '11922222222', 'Claro', hash).run();
  const calls = [];
  const plan = { fail: new Map(), network: new Set() };
  globalThis.fetch = async (url, init) => {
    const body = Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push({ url: String(url), body, auth: init.headers.Authorization });
    if (plan.network.has(body.Body)) throw new Error('timeout');
    const status = plan.fail.get(body.Body);
    if (status) return new Response(JSON.stringify({ code: 21211, message: 'x' }), { status });
    return new Response(JSON.stringify({ sid: 'SM' + calls.length }), { status: 201 });
  };
  const call = (method, path, { body, cookie, headers } = {}) =>
    worker.fetch(new Request('https://teste.local' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vitalarme', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    }), env);
  const login = async (phone = '(11) 91111-1111') => {
    const res = await call('POST', '/api/login', { body: { phone, password: PASSWORD } });
    assert.equal(res.status, 200);
    return res.headers.get('Set-Cookie').split(';')[0];
  };
  return { DB, env, calls, plan, call, login };
}

const json = async res => res.json();
const bodies = calls => calls.map(c => c.body.Body);

async function prepareAccount(t, cookie) {
  const saved = await t.call('PUT', '/api/device', { cookie, body: { gsm: GSM, operator: 'Vivo', serial: '', elderName: 'Idoso Teste', respName: 'Resp Teste', respPhone: CONTACTS[0], address: '', notes: '' } });
  assert.equal(saved.status, 200);
  for (const [i, phone] of CONTACTS.entries()) {
    const res = await t.call('POST', '/api/contacts', { cookie, body: { name: `Contato ${i + 1}`, relation: 'Teste', phone, type: 'SMS' } });
    assert.equal(res.status, 200);
  }
}

test.afterEach(() => { globalThis.fetch = realFetch; });

test('site abre e endpoint de saúde responde', async () => {
  const t = await setup();
  assert.equal(await (await t.call('GET', '/')).text(), 'asset');
  const health = await t.call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await json(health), { ok: true });
});

test('login correto, senha incorreta e acesso sem sessão', async () => {
  const t = await setup();
  assert.equal((await t.call('GET', '/api/state')).status, 401);
  const wrong = await t.call('POST', '/api/login', { body: { phone: '(11) 91111-1111', password: 'errada' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('Set-Cookie'), null);
  const ok = await t.call('POST', '/api/login', { body: { phone: '(11) 91111-1111', password: PASSWORD } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const unknown = await t.call('POST', '/api/login', { body: { phone: '(11) 98888-8888', password: PASSWORD } });
  assert.equal(unknown.status, 401);
});

test('limite de tentativas de login', async () => {
  const t = await setup();
  for (let i = 0; i < 5; i++) {
    assert.equal((await t.call('POST', '/api/login', { body: { phone: '(11) 91111-1111', password: 'errada' } })).status, 401);
  }
  assert.equal((await t.call('POST', '/api/login', { body: { phone: '(11) 91111-1111', password: PASSWORD } })).status, 429);
});

test('requisição sem cabeçalho de proteção ou de outra origem é recusada', async () => {
  const t = await setup();
  const cookie = await t.login();
  assert.equal((await t.call('PUT', '/api/device', { cookie, body: {}, headers: { 'X-Requested-With': 'outro' } })).status, 403);
  assert.equal((await t.call('PUT', '/api/device', { cookie, body: {}, headers: { Origin: 'https://malicioso.example' } })).status, 403);
});

test('dados persistem e uma conta não acessa dados de outra', async () => {
  const t = await setup();
  const a = await t.login();
  await prepareAccount(t, a);
  const stateA = await json(await t.call('GET', '/api/state', { cookie: a }));
  assert.equal(stateA.device.gsm, '(11) 90000-0099');
  assert.equal(stateA.device.serial, '');
  assert.equal(stateA.contacts.length, 3);
  const b = await t.login('(11) 92222-2222');
  const stateB = await json(await t.call('GET', '/api/state', { cookie: b }));
  assert.equal(stateB.contacts.length, 0);
  assert.equal(stateB.device.gsm, '');
  assert.equal((await t.call('DELETE', '/api/contacts/4', { cookie: b })).status, 404);
  assert.equal((await t.call('PUT', '/api/contacts/1', { cookie: b, body: { name: 'X', relation: 'Y', phone: CONTACTS[0], type: 'SMS' } })).status, 404);
});

test('contatos: posições 1 a 10, telefone inválido, duplicado e obrigatórios', async () => {
  const t = await setup();
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  assert.equal((await t.call('POST', '/api/contacts', { cookie, body: { name: 'X', relation: 'Y', phone: '123', type: 'SMS' } })).status, 400);
  assert.equal((await t.call('POST', '/api/contacts', { cookie, body: { name: 'X', relation: 'Y', phone: CONTACTS[0], type: 'SMS' } })).status, 409);
  for (let n = 4; n <= 10; n++) {
    const res = await t.call('POST', '/api/contacts', { cookie, body: { name: `C${n}`, relation: 'Teste', phone: `1191000000${n - 4}`, type: 'SMS + chamada' } });
    assert.equal(res.status, 200);
  }
  const full = await t.call('POST', '/api/contacts', { cookie, body: { name: 'C11', relation: 'Teste', phone: '11919999999', type: 'SMS' } });
  assert.equal(full.status, 409);
  const state = await json(await t.call('GET', '/api/state', { cookie }));
  assert.deepEqual(state.contacts.map(c => c.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal((await t.call('DELETE', '/api/contacts/2', { cookie })).status, 409);
  assert.equal((await t.call('DELETE', '/api/contacts/10', { cookie })).status, 200);
});

test('modo desativado: prévia, nenhuma requisição e nada avança', async () => {
  const t = await setup({ sms: false });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  const res = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  assert.equal(res.status, 503);
  const data = await json(res);
  assert.equal(data.error, 'SMS_DISABLED');
  assert.equal(data.preview[0].body, 'NONADAPRECISA DE PIN: NÃOTRAVESSIAPRECISA DE PIN: ');
  assert.equal(t.calls.length, 0);
  const state = await json(await t.call('GET', '/api/state', { cookie }));
  assert.equal(state.pairing.status, 'nao_configurado');
  assert.equal(state.pairing.steps.length, 0);
  assert.equal(state.smsEnabled, false);
  assert.equal((await t.call('POST', '/api/pairing/confirm', { cookie, body: {} })).status, 409);
});

test('exige GSM salvo e ao menos 3 contatos', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  assert.equal((await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } })).status, 400);
  await t.call('PUT', '/api/device', { cookie, body: { gsm: GSM, operator: 'Vivo', serial: '', elderName: 'I', respName: 'R', respPhone: CONTACTS[0], address: '', notes: '' } });
  assert.equal((await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } })).status, 200);
  const res = await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, 'MIN_CONTACTS');
});

test('caminho sem PIN, confirmação manual e novo pareamento', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  const start = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  assert.equal(start.status, 200);
  assert.equal((await json(start)).state.pairing.next, 'contacts');
  assert.equal((await t.call('POST', '/api/pairing/pin', { cookie, body: { pin: PIN } })).status, 409);
  const sent = await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
  assert.equal(sent.status, 200);
  assert.deepEqual(bodies(t.calls), [
    'NONADAPRECISA DE PIN: NÃOTRAVESSIAPRECISA DE PIN: ',
    'NONADACONTATO DE EMERGÊNCIA 1: 5511900000001TRAVESSIACONTATO DE EMERGÊNCIA 1: ',
    'NONADACONTATO DE EMERGÊNCIA 2: 5511900000002TRAVESSIACONTATO DE EMERGÊNCIA 2: ',
    'NONADACONTATO DE EMERGÊNCIA 3: 5511900000003TRAVESSIACONTATO DE EMERGÊNCIA 3: ',
    'NONADAPRONTO PARA PAREAR CONTATOS: SIMTRAVESSIAPRONTO PARA PAREAR CONTATOS: '
  ]);
  assert.ok(t.calls.every(c => c.body.To === '+5511900000099' && c.body.From === '+15550000000'));
  assert.ok(t.calls.every(c => c.auth.startsWith('Basic ')));
  const waiting = (await json(sent)).state;
  assert.equal(waiting.pairing.status, 'comandos_solicitados');
  assert.equal(waiting.pairing.next, 'confirm');
  assert.equal(waiting.contacts[0].commandState, 'solicitado');
  const confirmed = (await json(await t.call('POST', '/api/pairing/confirm', { cookie, body: {} }))).state;
  assert.equal(confirmed.pairing.status, 'confirmado');
  assert.ok(confirmed.pairing.confirmedAt);
  assert.equal((await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } })).status, 409);

  t.calls.length = 0;
  const again = await t.call('POST', '/api/pairing/restart', { cookie, body: {} });
  assert.equal(again.status, 200);
  assert.deepEqual(bodies(t.calls), ['NONADAPAREAR: SIMTRAVESSIAPAREAR: ']);
  const afterRestart = (await json(again)).state;
  assert.equal(afterRestart.pairing.status, 'em_andamento');
  assert.equal(afterRestart.pairing.confirmedAt, null);
  assert.equal(afterRestart.pairing.next, 'contacts');
  assert.equal((await t.call('POST', '/api/pairing/confirm', { cookie, body: {} })).status, 409);
  t.calls.length = 0;
  const resent = await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
  assert.equal(resent.status, 200);
  assert.equal(t.calls.length, 4);
  assert.ok(!bodies(t.calls).some(b => b.includes('PIN')));
  assert.equal((await json(resent)).state.pairing.status, 'comandos_solicitados');
  const second = (await json(await t.call('POST', '/api/pairing/confirm', { cookie, body: {} }))).state;
  assert.equal(second.pairing.status, 'confirmado');
});

test('caminho com PIN e PIN fora do banco e dos logs', async () => {
  const t = await setup({ sms: true });
  const logs = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...args) => logs.push(args.join(' '));
  try {
    const cookie = await t.login();
    await prepareAccount(t, cookie);
    const start = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: true } });
    assert.equal((await json(start)).state.pairing.next, 'pin');
    assert.equal((await t.call('POST', '/api/pairing/pin', { cookie, body: { pin: '12' } })).status, 400);
    assert.equal((await t.call('POST', '/api/pairing/contacts', { cookie, body: {} })).status, 409);
    const pin = await t.call('POST', '/api/pairing/pin', { cookie, body: { pin: PIN } });
    assert.equal(pin.status, 200);
    assert.equal((await json(pin)).state.pairing.next, 'contacts');
    await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
    const list = bodies(t.calls);
    assert.equal(list[0], 'NONADAPRECISA DE PIN: SIMTRAVESSIAPRECISA DE PIN: ');
    assert.equal(list[1], `NONADAPIN: ${PIN}TRAVESSIAPIN: `);
    assert.equal(list[2], 'NONADAPRONTO PARA PAREAR PIN: SIMTRAVESSIAPRONTO PARA PAREAR PIN: ');
    assert.equal(list.length, 7);
    const dump = t.DB.dump();
    assert.ok(!dump.includes(PIN));
    assert.ok(!dump.includes(PASSWORD));
    assert.ok(!dump.includes('token-de-teste'));
    assert.ok(!logs.join('\n').includes(PIN));
    assert.ok(!logs.join('\n').includes('token-de-teste'));
  } finally {
    Object.assign(console, original);
  }
});

test('clique duplo não duplica o lote', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  t.calls.length = 0;
  const [first, second] = await Promise.all([
    t.call('POST', '/api/pairing/contacts', { cookie, body: {} }),
    t.call('POST', '/api/pairing/contacts', { cookie, body: {} })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(t.calls.length, 4);
  assert.equal(new Set(bodies(t.calls)).size, 4);
});

test('falha parcial não vira sucesso e etapas aceitas não são reenviadas', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  t.calls.length = 0;
  const second = 'NONADACONTATO DE EMERGÊNCIA 2: 5511900000002TRAVESSIACONTATO DE EMERGÊNCIA 2: ';
  t.plan.fail.set(second, 400);
  const res = await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
  assert.equal(res.status, 502);
  assert.equal((await json(res)).error, 'SEND_FAILED');
  assert.equal(t.calls.length, 2);
  assert.ok(!bodies(t.calls).some(b => b.includes('PRONTO PARA PAREAR CONTATOS')));
  const state = await json(await t.call('GET', '/api/state', { cookie }));
  assert.equal(state.pairing.status, 'incompleta');
  assert.notEqual(state.pairing.status, 'comandos_solicitados');
  assert.equal(state.contacts[0].commandState, 'solicitado');
  assert.equal(state.contacts[1].commandState, 'falha');
  t.plan.fail.clear();
  t.calls.length = 0;
  const retry = await t.call('POST', '/api/pairing/contacts', { cookie, body: {} });
  assert.equal(retry.status, 200);
  assert.equal(t.calls.length, 3);
  assert.ok(!bodies(t.calls).some(b => b.includes('EMERGÊNCIA 1')));
});

test('timeout é incerto e só repete com confirmação explícita', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  const first = 'NONADAPRECISA DE PIN: NÃOTRAVESSIAPRECISA DE PIN: ';
  t.plan.network.add(first);
  const res = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  assert.equal(res.status, 502);
  const data = await json(res);
  assert.equal(data.error, 'SEND_UNCERTAIN');
  assert.equal(data.canRetry, true);
  t.plan.network.clear();
  t.calls.length = 0;
  const blocked = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  assert.equal(blocked.status, 502);
  assert.equal(t.calls.length, 0);
  const forced = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false, confirmRetry: true } });
  assert.equal(forced.status, 200);
  assert.equal(t.calls.length, 1);
});

test('SMS ativado sem credenciais não envia e não avança', async () => {
  const t = await setup({ sms: true });
  delete t.env.TWILIO_AUTH_TOKEN;
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  const res = await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  assert.equal(res.status, 503);
  assert.equal((await json(res)).error, 'SMS_MISCONFIGURED');
  assert.equal(t.calls.length, 0);
});

test('histórico registra ações do site e o painel não afirma conexão', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  const state = await json(await t.call('GET', '/api/state', { cookie }));
  const types = state.history.map(h => h.type);
  for (const type of ['DADOS_ATUALIZADOS', 'CONTATO_INCLUIDO', 'CONFIG_INICIADA', 'ENVIO_SOLICITADO']) assert.ok(types.includes(type), type);
  assert.ok(['nao_configurado', 'em_andamento', 'incompleta', 'comandos_solicitados', 'confirmado'].includes(state.pairing.status));
  assert.notEqual(state.pairing.status, 'confirmado');
});

test('trocar o GSM cancela configuração em andamento', async () => {
  const t = await setup({ sms: true });
  const cookie = await t.login();
  await prepareAccount(t, cookie);
  await t.call('POST', '/api/pairing/start', { cookie, body: { needsPin: false } });
  await t.call('PUT', '/api/device', { cookie, body: { gsm: '11900000077', operator: 'Vivo', serial: 'ABC-1', elderName: 'I', respName: 'R', respPhone: CONTACTS[0], address: '', notes: '' } });
  const state = await json(await t.call('GET', '/api/state', { cookie }));
  assert.equal(state.pairing.status, 'nao_configurado');
  assert.equal(state.device.serial, 'ABC-1');
});
