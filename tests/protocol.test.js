import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildCommand, commands } from '../worker/protocol.js';
import { cleanText, normalizeMobile, validPin } from '../worker/validation.js';

test('formatação literal dos comandos', () => {
  assert.equal(commands.parear(), 'NONADAPAREAR: SIMTRAVESSIAPAREAR: ');
  assert.equal(commands.precisaDePin(false), 'NONADAPRECISA DE PIN: NÃOTRAVESSIAPRECISA DE PIN: ');
  assert.equal(commands.precisaDePin(true), 'NONADAPRECISA DE PIN: SIMTRAVESSIAPRECISA DE PIN: ');
  assert.equal(commands.pin('4821'), 'NONADAPIN: 4821TRAVESSIAPIN: ');
  assert.equal(commands.prontoPin(), 'NONADAPRONTO PARA PAREAR PIN: SIMTRAVESSIAPRONTO PARA PAREAR PIN: ');
  assert.equal(commands.contato(1, '12978140349'), 'NONADACONTATO DE EMERGÊNCIA 1: 5512978140349TRAVESSIACONTATO DE EMERGÊNCIA 1: ');
  assert.equal(commands.contato(10, '12978140349'), 'NONADACONTATO DE EMERGÊNCIA 10: 5512978140349TRAVESSIACONTATO DE EMERGÊNCIA 10: ');
  assert.equal(commands.prontoContatos(), 'NONADAPRONTO PARA PAREAR CONTATOS: SIMTRAVESSIAPRONTO PARA PAREAR CONTATOS: ');
  assert.ok(buildCommand('X', 'Y').endsWith(': '));
});

test('comandos não normalizam nem aceitam valores inválidos', () => {
  assert.throws(() => commands.contato(0, '12978140349'));
  assert.throws(() => commands.contato(11, '12978140349'));
  assert.throws(() => commands.contato(1, '5512978140349'));
  assert.throws(() => commands.pin('12'));
  assert.throws(() => commands.pin('12a4'));
});

test('validação de telefones, PIN e textos', () => {
  assert.equal(normalizeMobile('(11) 90000-0001'), '11900000001');
  assert.equal(normalizeMobile('1190000'), null);
  assert.equal(normalizeMobile('11800000001'), null);
  assert.equal(normalizeMobile('(11) 4000-0001'), null);
  assert.equal(validPin('1234'), true);
  assert.equal(validPin('123'), false);
  assert.equal(cleanText('  Ana  ', { max: 10, required: true }), 'Ana');
  assert.equal(cleanText('', { max: 10, required: true }), null);
  assert.equal(cleanText('x'.repeat(11), { max: 10 }), null);
});

test('o site continua referenciando arquivos que existem em public/', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 10);
  for (const ref of refs) assert.ok(existsSync(new URL(`../public/${ref}`, import.meta.url)), ref);
  assert.ok(!/<!--|TODO|TROCAR/.test(html));
});
