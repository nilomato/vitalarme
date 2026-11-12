(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
const STATUS_LABELS = {
nao_configurado: 'Não configurado',
em_andamento: 'Configuração em andamento',
incompleta: 'Configuração incompleta',
comandos_solicitados: 'Aguardando confirmação do usuário',
confirmado: 'Pareamento confirmado pelo usuário'
};
const STEP_LABELS = {solicitando: 'Em andamento', aceito: 'Aceito pelo Twilio', falha: 'Recusado pelo Twilio', incerto: 'Resultado incerto'};
let lastCall = null;
let lastPreview = null;
function renderPairing() {
const p = state.pairing;
$('v-pair-status').textContent = STATUS_LABELS[p.status] || STATUS_LABELS.nao_configurado;
$('v-dash-pairing').textContent = STATUS_LABELS[p.status] || STATUS_LABELS.nao_configurado;
$('v-dash-pairing-detail').textContent = p.status === 'confirmado' && p.confirmedAt
? 'Confirmado em ' + VA.formatDate(p.confirmedAt)
: 'Sem monitoramento em tempo real';
$('v-pair-sms-off').hidden = state.smsEnabled;
$('v-pair-gsm').textContent = state.device.gsm || 'não informado';
$('v-pair-s-start').hidden = p.next !== 'start';
$('v-pair-s-pin').hidden = p.next !== 'pin';
$('v-pair-s-contacts').hidden = p.next !== 'contacts';
$('v-pair-s-confirm').hidden = p.next !== 'confirm';
$('v-pair-s-done').hidden = p.next !== 'done';
$('v-pair-confirmed-at').textContent = p.confirmedAt ? VA.formatDate(p.confirmedAt) : '';
const canRestart = ['confirm', 'done', 'restart'].includes(p.next);
$('v-pair-restart').hidden = !canRestart;
$('v-pair-restart').textContent = p.next === 'restart' ? 'Tentar enviar PAREAR novamente' : 'Parear novamente';
$('v-pair-cancel').hidden = !p.open;
$('v-pair-s-more').hidden = $('v-pair-restart').hidden && $('v-pair-cancel').hidden;
$('v-pair-s-force').hidden = !lastCall;
$('v-pair-steps').innerHTML = p.steps && p.steps.length
? p.steps.map(s => `<div class="v-item"><div><b>${VA.escapeHTML(s.label)}</b></div><span class="v-badge">${STEP_LABELS[s.status] || ''}</span></div>`).join('')
: '<div class="v-empty">Nenhuma etapa solicitada.</div>';
const preview = $('v-pair-preview');
if (lastPreview) {
preview.hidden = false;
preview.innerHTML = '<b>Envio desativado: nada foi enviado.</b><p class="v-small">Texto exato que seria solicitado (cada texto termina com um espaço; o PIN aparece mascarado):</p>' +
lastPreview.map(x => `<p style="margin:6px 0;white-space:pre-wrap;word-break:break-all;font-family:monospace;font-size:12px">"${VA.escapeHTML(x.body)}"</p>`).join('');
} else {
preview.hidden = true;
preview.innerHTML = '';
}
}
async function call(path, body, retryBody) {
lastPreview = null;
lastCall = null;
const result = await VA.api('POST', path, body);
if (result.ok) {
VA.applyState(result.data.state);
VA.renderAll();
return result;
}
if (result.data.error === 'SMS_DISABLED') lastPreview = result.data.preview;
if (result.data.canRetry) lastCall = {path, body: retryBody || body};
VA.notify(result.data.message || 'Não foi possível concluir a solicitação.');
await VA.refresh();
return result;
}
VA.renderPairing = renderPairing;
VA.initPairing = function () {
$('v-pair-pin-yes').addEventListener('click', () => call('/api/pairing/start', {needsPin: true}));
$('v-pair-pin-no').addEventListener('click', () => call('/api/pairing/start', {needsPin: false}));
$('v-pair-send-pin').addEventListener('click', async () => {
const pin = $('v-pair-pin').value;
const result = await call('/api/pairing/pin', {pin});
$('v-pair-pin').value = '';
if (result.data.canRetry) lastCall = {path: '/api/pairing/pin', body: {pin}};
});
$('v-pair-send-contacts').addEventListener('click', () => call('/api/pairing/contacts', {}));
$('v-pair-confirm').addEventListener('click', async () => {
const result = await call('/api/pairing/confirm', {});
if (result.ok) VA.notify('Pareamento confirmado pelo usuário.');
});
$('v-pair-restart').addEventListener('click', () => call('/api/pairing/restart', {}));
$('v-pair-cancel').addEventListener('click', () => call('/api/pairing/cancel', {}));
$('v-pair-force').addEventListener('click', () => {
if (!lastCall) return;
const retry = lastCall;
call(retry.path, {...retry.body, confirmRetry: true}, retry.body);
});
};
})();
