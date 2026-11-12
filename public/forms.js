(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
function fillSettings() {
const d = state.device;
$('v-gsm').value = d.gsm || '';
$('v-operator').value = d.operator || 'Vivo';
$('v-serial').value = d.serial || '';
$('v-elder-name').value = d.elderName || '';
$('v-resp-name').value = d.respName || '';
$('v-resp-phone').value = d.respPhone || '';
$('v-address').value = d.address || '';
$('v-notes').value = d.notes || '';
}
VA.fillSettings = fillSettings;
VA.initForms = function () {
$('v-login-form').addEventListener('submit', async e => {
e.preventDefault();
const phone = $('v-login-phone').value.trim();
if (!VA.isMobile(phone)) { VA.notify('Informe um celular válido com DDD: (11) 90000-0000.'); return; }
const result = await VA.api('POST', '/api/login', {phone, password: $('v-login-password').value});
$('v-login-password').value = '';
if (!result.ok) { VA.notify(result.data.message || 'Não foi possível entrar.'); return; }
VA.applyState(result.data);
VA.showSystem();
});
$('v-settings-form').addEventListener('submit', async e => {
e.preventDefault();
if (!VA.isMobile($('v-gsm').value) || !VA.isMobile($('v-resp-phone').value)) {
VA.notify('Confira os celulares do chip e do responsável. Informe DDD + 9 dígitos.'); return;
}
const result = await VA.api('PUT', '/api/device', {
gsm: $('v-gsm').value, operator: $('v-operator').value, serial: $('v-serial').value,
elderName: $('v-elder-name').value, respName: $('v-resp-name').value, respPhone: $('v-resp-phone').value,
address: $('v-address').value, notes: $('v-notes').value
});
if (!result.ok) { VA.notify(result.data.message || 'Não foi possível salvar.'); return; }
VA.applyState(result.data.state); fillSettings(); VA.renderAll(); VA.notify('Dados salvos.');
});
$('v-contact-form').addEventListener('submit', async e => {
e.preventDefault();
const position = VA.ui.editPosition;
const body = {name: $('v-c-name').value, relation: $('v-c-relation').value, phone: $('v-c-phone').value, type: $('v-c-type').value};
if (!body.name.trim() || !body.relation.trim() || !VA.isMobile(body.phone)) {
VA.notify('Preencha nome, vínculo e um celular válido com DDD.'); return;
}
const result = position > 0
? await VA.api('PUT', '/api/contacts/' + position, body)
: await VA.api('POST', '/api/contacts', body);
if (!result.ok) { VA.notify(result.data.message || 'Não foi possível salvar o contato.'); return; }
$('v-contact-editor').hidden = true;
VA.applyState(result.data.state); VA.renderAll(); VA.notify('Contato salvo.');
});
};
})();
