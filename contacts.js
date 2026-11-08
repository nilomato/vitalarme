(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
function renderContacts() {
$('v-dash-count').textContent = state.contacts.length + ' cadastrados';
$('v-contacts-requirement').textContent = state.contacts.length >= 3
? `${state.contacts.length} contatos cadastrados. Mínimo de 3 atendido (somente simulação).`
: `Atenção: faltam ${3 - state.contacts.length} contatos para atingir o mínimo.`;
$('v-contact-list').innerHTML = state.contacts.map((c, i) => `
<div class="v-item"><div><b>${i + 1}. ${VA.escapeHTML(c.name)}</b>
<div class="v-contactmeta"><span>${VA.escapeHTML(c.relation)}</span><span>• ${VA.escapeHTML(c.phone)}</span><span>• ${VA.escapeHTML(c.type)}</span></div>
<small>${i < 3 ? 'Contato obrigatório' : 'Contato adicional'}</small></div>
<div class="v-btnrow"><button class="v-btn v-outline" type="button" data-edit="${i}">Editar</button>
${i >= 3 ? `<button class="v-btn v-ghost" type="button" data-delete="${i}">Excluir</button>` : ''}</div></div>`).join('');
}
function showContactEditor(index) {
VA.ui.editIndex = index;
const c = index >= 0 ? state.contacts[index] : {name:'', relation:'', phone:'', type:'SMS'};
$('v-editor-title').textContent = index >= 0 ? 'Editar contato' : 'Adicionar contato';
$('v-c-name').value = c.name;
$('v-c-relation').value = c.relation;
$('v-c-phone').value = c.phone;
$('v-c-type').value = c.type;
$('v-contact-editor').hidden = false;
$('v-contact-editor').scrollIntoView({behavior:'smooth', block:'nearest'});
}
VA.renderContacts = renderContacts;
VA.initContacts = function () {
$('v-add-contact').addEventListener('click', () => showContactEditor(-1));
$('v-close-editor').addEventListener('click', () => { $('v-contact-editor').hidden = true; });
$('v-contact-list').addEventListener('click', e => {
const edit = e.target.closest('[data-edit]');
const del = e.target.closest('[data-delete]');
if (edit) showContactEditor(Number(edit.dataset.edit));
if (del) {
const i = Number(del.dataset.delete);
if (i < 3 || state.contacts.length <= 3) { VA.notify('É necessário manter pelo menos três contatos.'); return; }
state.contacts.splice(i, 1);
VA.renderAll(); VA.notify('Contato adicional excluído da demonstração.');
}
});
};
})();
