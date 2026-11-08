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
function formatMobile(value) {
const d = digits(value);
return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function now() { return new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(new Date()); }
function notify(msg) {
clearTimeout(toastTimer);
$('v-toast').textContent = msg;
$('v-toast').hidden = false;
toastTimer = setTimeout(() => { $('v-toast').hidden = true; }, 5000);
}
const state = {
device: {gsm:'', carrier:'Vivo'},
elderly: {name:'Maria (exemplo)', responsible:'Carlos (exemplo)', phone:'(11) 90000-0001', address:'', notes:''},
contacts: [
{name:'Carlos (exemplo)', relation:'Filho', phone:'(11) 90000-0001', type:'SMS'},
{name:'Luciana (exemplo)', relation:'Familiar', phone:'(11) 90000-0002', type:'SMS'},
{name:'Renata (exemplo)', relation:'Cuidadora', phone:'(11) 90000-0003', type:'SMS'}
],
events: []
};
window.Vitalarme = {root, $, escapeHTML, digits, isMobile, formatMobile, now, notify, state, ui:{editIndex:-1}};
})();
