(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
const ACTION_LABELS = {
DADOS_ATUALIZADOS: 'Dados atualizados',
CONTATO_INCLUIDO: 'Contato incluído',
CONTATO_ALTERADO: 'Contato alterado',
CONTATO_EXCLUIDO: 'Contato excluído',
CONFIG_INICIADA: 'Configuração iniciada',
ENVIO_SOLICITADO: 'Envio solicitado',
ENVIO_FALHOU: 'Falha de envio',
ENVIO_INCERTO: 'Envio incerto',
ENVIO_DESATIVADO: 'Envio desativado',
NOVO_PAREAMENTO: 'Novo pareamento',
PAREAMENTO_CANCELADO: 'Pareamento cancelado',
CONFIRMACAO_MANUAL: 'Confirmação manual'
};
function applyState(s) {
state.account = s.account;
state.device = s.device;
state.contacts = s.contacts;
state.history = s.history;
state.pairing = s.pairing;
state.smsEnabled = s.smsEnabled;
}
function renderDashboard() {
$('v-dash-name').textContent = state.device.elderName || '—';
$('v-dash-carrier').textContent = state.device.operator ? state.device.operator + ' (não verificada)' : '—';
$('v-dash-count').textContent = state.contacts.length + ' cadastrados';
$('v-recent').innerHTML = state.history.length
? state.history.slice(0, 3).map(x => `<div class="v-item"><div><b>${VA.escapeHTML(x.text)}</b><p>${VA.escapeHTML(VA.formatDate(x.when))}</p></div><span class="v-badge">${VA.escapeHTML(ACTION_LABELS[x.type] || x.type)}</span></div>`).join('')
: '<div class="v-empty">Nenhuma ação registrada ainda.</div>';
}
function renderActions() {
$('v-actions').innerHTML = state.history.length
? state.history.map(x => `<tr><td>${VA.escapeHTML(VA.formatDate(x.when))}</td><td>${VA.escapeHTML(ACTION_LABELS[x.type] || x.type)}</td><td>${VA.escapeHTML(x.text)}</td></tr>`).join('')
: '<tr><td colspan="3" style="text-align:center;color:#708196">Nenhuma ação registrada.</td></tr>';
}
function renderHistory() {
const filter = $('v-filter').value;
const list = state.events.filter(x => filter === 'ALL' || x.type === filter);
$('v-history').innerHTML = list.length
? list.map(x => `<tr><td>${VA.escapeHTML(x.when)}</td><td>${VA.escapeHTML(x.type)}</td><td>${VA.escapeHTML(x.title)}</td><td>${VA.escapeHTML(x.status)}</td></tr>`).join('')
: '<tr><td colspan="4" style="text-align:center;color:#708196">Nenhum evento encontrado.</td></tr>';
$('v-sms-preview').textContent = `ALERTA VITALARME: Atenção! O dispositivo de ${state.device.elderName || 'o idoso'} identificou uma possível queda. Entre em contato para verificar se precisa de ajuda. (Mensagem de exemplo; não enviada.)`;
}
function renderAll() {
renderDashboard();
VA.renderContacts();
renderActions();
renderHistory();
VA.renderPairing();
}
async function refresh() {
const result = await VA.api('GET', '/api/state');
if (result.ok) { applyState(result.data); renderAll(); }
return result;
}
function showSystem() {
VA.fillSettings();
$('v-entrada').hidden = true;
$('v-sistema').hidden = false;
VA.go('painel');
renderAll();
}
VA.applyState = applyState;
VA.renderAll = renderAll;
VA.renderHistory = renderHistory;
VA.refresh = refresh;
VA.showSystem = showSystem;
VA.initNavigation();
VA.initContacts();
VA.initForms();
VA.initPairing();
VA.initSimulator();
$('v-filter').addEventListener('change', renderHistory);
VA.api('GET', '/api/state').then(result => {
if (result.ok) { applyState(result.data); showSystem(); }
});
})();
