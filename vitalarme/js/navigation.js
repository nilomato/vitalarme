(function () {
'use strict';
const VA = window.Vitalarme;
if (!VA) return;
function go(tab) {
VA.root.querySelectorAll('.v-page').forEach(page => page.hidden = page.id !== 'v-page-' + tab);
VA.root.querySelectorAll('[data-tab]').forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
}
VA.go = go;
VA.initNavigation = function () {
VA.root.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.tab)));
VA.root.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.goto)));
VA.$('v-sair').addEventListener('click', () => window.location.reload());
};
})();
