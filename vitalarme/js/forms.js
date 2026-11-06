(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
VA.initForms = function () {
$('v-login-form').addEventListener('submit', e => {
e.preventDefault();
const num = $('v-login-phone').value.trim();
if (!VA.isMobile(num)) { VA.notify('Informe um celular válido com DDD: (11) 90000-0000.'); return; }
state.device.gsm = VA.formatMobile(num);
state.device.carrier = $('v-login-carrier').value;
$('v-login-password').value = '';
$('v-gsm').value = state.device.gsm;
$('v-operator').value = state.device.carrier;
$('v-elder-name').value = state.elderly.name;
$('v-resp-name').value = state.elderly.responsible;
$('v-resp-phone').value = state.elderly.phone;
$('v-address').value = state.elderly.address;
$('v-notes').value = state.elderly.notes;
$('v-entrada').hidden = true;
$('v-sistema').hidden = false;
VA.go('painel'); VA.renderAll();
});
$('v-settings-form').addEventListener('submit', e => {
e.preventDefault();
if (!VA.isMobile($('v-gsm').value) || !VA.isMobile($('v-resp-phone').value)) {
VA.notify('Confira os celulares do chip e do responsável. Informe DDD + 9 dígitos.'); return;
}
state.device.gsm = VA.formatMobile($('v-gsm').value);
state.device.carrier = $('v-operator').value;
state.elderly = {
name:$('v-elder-name').value.trim(), responsible:$('v-resp-name').value.trim(),
phone:VA.formatMobile($('v-resp-phone').value), address:$('v-address').value.trim(),
notes:$('v-notes').value.trim()
};
$('v-gsm').value = state.device.gsm;
$('v-resp-phone').value = state.elderly.phone;
VA.renderAll(); VA.notify('Dados atualizados nesta sessão de demonstração.');
});
$('v-contact-form').addEventListener('submit', e => {
e.preventDefault();
const editIndex = VA.ui.editIndex;
const c = {
name:$('v-c-name').value.trim(), relation:$('v-c-relation').value.trim(),
phone:VA.formatMobile($('v-c-phone').value), type:$('v-c-type').value
};
if (!c.name || !c.relation || !VA.isMobile($('v-c-phone').value)) {
VA.notify('Preencha nome, vínculo e um celular válido com DDD.'); return;
}
if (state.contacts.some((other, i) => i !== editIndex && VA.digits(other.phone) === VA.digits(c.phone))) {
VA.notify('Este celular já está cadastrado em outro contato.'); return;
}
if (editIndex >= 0) state.contacts[editIndex] = c;
else state.contacts.push(c);
$('v-contact-editor').hidden = true;
VA.renderAll(); VA.notify('Contato salvo nesta sessão.');
});
};
})();
