(function () {
'use strict';
const root = document.getElementById('vitalarme');
if (!root) return;
let toastTimer = null;
const $ = id => root.querySelector('#' + id);
function escapeHTML(value) {
return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function digits(value) { return String(value).replace(/\D/g, ''); }
function isMobile(value) { return /^[1-9][1-9]9\d{8}$/.test(digits(value)); }
function formatDate(iso) {
const date = new Date(iso);
return iso && !isNaN(date) ? new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date) : '';
}
function now() { return new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(new Date()); }
function notify(msg) {
clearTimeout(toastTimer);
$('v-toast').textContent = msg;
$('v-toast').hidden = false;
toastTimer = setTimeout(() => { $('v-toast').hidden = true; }, 6000);
}
async function api(method, path, body) {
const options = {method, credentials:'same-origin', headers:{'X-Requested-With':'vitalarme'}};
if (body !== undefined) {
options.headers['Content-Type'] = 'application/json';
options.body = JSON.stringify(body);
}
let response;
try {
response = await fetch(path, options);
} catch {
return {ok:false, status:0, data:{error:'NETWORK', message:'Não foi possível falar com o servidor.'}};
}
let data = {};
try { data = await response.json(); } catch { data = {}; }
if (response.status === 401 && !['/api/login', '/api/state', '/api/logout'].includes(path)) {
notify('Sessão expirada. Entre novamente.');
setTimeout(() => window.location.reload(), 1500);
}
return {ok:response.ok, status:response.status, data};
}
const state = {
account: null,
device: {},
contacts: [],
history: [],
pairing: {status:'nao_configurado', next:'start', steps:[]},
smsEnabled: false,
events: []
};
window.Vitalarme = {root, $, escapeHTML, digits, isMobile, formatDate, now, notify, api, state, ui:{editPosition:-1}};
})();
