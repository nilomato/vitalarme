(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
const COMMAND_LABELS = {
salvo: 'Salvo no site',
solicitado: 'Envio solicitado (entrega não confirmada)',
falha: 'Falha no envio',
incerto: 'Envio incerto',
enviando: 'Envio em andamento'
};
function renderContacts() {
const count = state.contacts.length;
$('v-dash-count').textContent = count + ' cadastrados';
$('v-contacts-requirement').textContent = count >= 3
? `${count} contatos cadastrados. Mínimo de 3 atendido.`
: `Atenção: faltam ${3 - count} contatos para atingir o mínimo.`;
$('v-contact-list').innerHTML = state.contacts.map(c => `
<div class="v-item"><div><b>${c.position}. ${VA.escapeHTML(c.name)}</b>
<div class="v-contactmeta"><span>${VA.escapeHTML(c.relation)}</span><span>• ${VA.escapeHTML(c.phone)}</span><span>• ${VA.escapeHTML(c.type)}</span></div>
<div class="v-contactmeta"><span class="v-badge">${COMMAND_LABELS[c.commandState] || COMMAND_LABELS.salvo}</span></div>
<small>${c.position <= 3 ? 'Contato obrigatório' : 'Contato adicional'}</small></div>
<div class="v-btnrow"><button class="v-btn v-outline" type="button" data-edit="${c.position}">Editar</button>
${c.position > 3 ? `<button class="v-btn v-ghost" type="button" data-delete="${c.position}">Excluir</button>` : ''}</div></div>`).join('');
}
function showContactEditor(position) {
VA.ui.editPosition = position;
const c = position > 0 ? state.contacts.find(x => x.position === position) : null;
const data = c || {name:'', relation:'', phone:'', type:'SMS'};
$('v-editor-title').textContent = c ? 'Editar contato' : 'Adicionar contato';
$('v-c-name').value = data.name;
$('v-c-relation').value = data.relation;
$('v-c-phone').value = data.phone;
$('v-c-type').value = data.type;
$('v-contact-editor').hidden = false;
$('v-contact-editor').scrollIntoView({behavior:'smooth', block:'nearest'});
}
VA.renderContacts = renderContacts;
VA.initContacts = function () {
$('v-add-contact').addEventListener('click', () => showContactEditor(-1));
$('v-close-editor').addEventListener('click', () => { $('v-contact-editor').hidden = true; });
$('v-contact-list').addEventListener('click', async e => {
const edit = e.target.closest('[data-edit]');
const del = e.target.closest('[data-delete]');
if (edit) showContactEditor(Number(edit.dataset.edit));
if (del) {
const result = await VA.api('DELETE', '/api/contacts/' + del.dataset.delete);
if (!result.ok) { VA.notify(result.data.message || 'Não foi possível excluir.'); return; }
VA.applyState(result.data.state); VA.renderAll(); VA.notify('Contato adicional excluído.');
}
});
};
})();
