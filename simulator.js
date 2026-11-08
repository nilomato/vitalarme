(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
const $ = VA.$;
const state = VA.state;
let countdown = null;
let remaining = 15;
let alertType = null;
function stopAlarm() { clearInterval(countdown); countdown = null; $('v-alarm-panel').hidden = true; }
function startAlarm(type) {
stopAlarm();
alertType = type; remaining = 15;
$('v-alarm-title').textContent = type === 'FALL' ? 'Possível queda (simulada)' : 'Botão SOS (simulado)';
$('v-countdown').textContent = remaining;
$('v-alarm-panel').hidden = false;
$('v-alarm-panel').scrollIntoView({behavior:'smooth', block:'start'});
countdown = setInterval(() => {
remaining--; $('v-countdown').textContent = remaining;
if (remaining <= 0) concludeAlarm();
}, 1000);
}
function concludeAlarm() {
const type = alertType;
stopAlarm();
VA.logEvent(type, type === 'FALL' ? 'Possível queda detectada (simulação)' : 'Botão SOS acionado (simulação)', 'Simulado — SMS não enviado');
VA.go('historico'); VA.notify('Simulação registrada. Nenhum SMS ou chamada real foi efetuado.');
}
VA.initSimulator = function () {
$('v-sim-fall').addEventListener('click', () => startAlarm('FALL'));
$('v-sim-sos').addEventListener('click', () => startAlarm('SOS'));
$('v-cancel-alarm').addEventListener('click', () => {
stopAlarm();
VA.logEvent('CANCEL', 'Alerta de demonstração cancelado', 'Cancelado — sem envio');
VA.notify('Falso alarme cancelado na simulação.');
});
$('v-confirm-alarm').addEventListener('click', concludeAlarm);
$('v-open-test').addEventListener('click', () => {
$('v-test-recipients').innerHTML = state.contacts.map(c => `<p style="margin:3px 0">• ${VA.escapeHTML(c.name)} — ${VA.escapeHTML(c.phone)}</p>`).join('');
$('v-test-area').hidden = false;
});
$('v-cancel-test').addEventListener('click', () => { $('v-test-area').hidden = true; });
$('v-confirm-test').addEventListener('click', () => {
$('v-test-area').hidden = true;
VA.logEvent('TEST', `Teste demonstrativo para ${state.contacts.length} contatos`, 'Simulado — nenhuma mensagem enviada');
VA.notify('Teste registrado, sem envio de SMS.'); VA.go('historico');
});
};
})();
