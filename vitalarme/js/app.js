(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
function renderDashboard() {
$('v-dash-name').textContent = state.elderly.name;
$('v-dash-carrier').textContent = state.device.carrier + ' (não verificada)';
$('v-dash-count').textContent = state.contacts.length + ' cadastrados';
$('v-recent').innerHTML = state.events.length
? state.events.slice(0, 3).map(x => `<div class="v-item"><div><b>${VA.escapeHTML(x.title)}</b><p>${VA.escapeHTML(x.when)} • ${VA.escapeHTML(x.status)}</p></div><span class="v-badge">${VA.escapeHTML(x.type)}</span></div>`).join('')
: '<div class="v-empty">Nenhum evento disponível nesta demonstração.</div>';
}
function renderHistory() {
const filter = $('v-filter').value;
const list = state.events.filter(x => filter === 'ALL' || x.type === filter);
$('v-history').innerHTML = list.length
? list.map(x => `<tr><td>${VA.escapeHTML(x.when)}</td><td>${VA.escapeHTML(x.type)}</td><td>${VA.escapeHTML(x.title)}</td><td>${VA.escapeHTML(x.status)}</td></tr>`).join('')
: '<tr><td colspan="4" style="text-align:center;color:#708196">Nenhum evento encontrado.</td></tr>';
$('v-sms-preview').textContent = `ALERTA VITALARME: Atenção! O dispositivo de ${state.elderly.name} identificou uma possível queda. Entre em contato para verificar se precisa de ajuda. (Mensagem de exemplo; não enviada.)`;
}
function renderAll() { renderDashboard(); VA.renderContacts(); renderHistory(); }
VA.renderAll = renderAll;
VA.logEvent = function (type, title, status) {
state.events.unshift({when:VA.now(), type, title, status});
renderDashboard(); renderHistory();
};
VA.initNavigation();
VA.initContacts();
VA.initForms();
VA.initSimulator();
$('v-filter').addEventListener('change', renderHistory);
})();
