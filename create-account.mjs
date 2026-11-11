import readline from 'node:readline';
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../worker/auth.js';
import { CARRIERS, normalizeMobile } from '../worker/validation.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = question => new Promise(resolve => rl.question(question, resolve));

function askHidden(question) {
  return new Promise(resolve => {
    const write = rl._writeToOutput;
    rl._writeToOutput = () => {};
    process.stdout.write(question);
    rl.question('', answer => {
      rl._writeToOutput = write;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const quote = value => `'${String(value).replace(/'/g, "''")}'`;

const name = (await ask('Nome de identificação: ')).trim();
const phone = normalizeMobile(await ask('Celular de login com DDD (ex.: 11900000000): '));
const carrier = (await ask(`Operadora (${CARRIERS.join(', ')}): `)).trim();
const password = await askHidden('Senha (não aparece enquanto você digita): ');
const again = await askHidden('Repita a senha: ');
rl.close();

if (!name || !phone || !CARRIERS.includes(carrier)) {
  console.error('Dados inválidos. Nada foi gerado.');
  process.exit(1);
}
if (password.length < 8 || password !== again) {
  console.error('A senha precisa ter 8 ou mais caracteres e as duas digitações devem ser iguais. Nada foi gerado.');
  process.exit(1);
}

const hash = await hashPassword(password);
const sql = `INSERT INTO accounts(name, login_phone, carrier, password_hash) VALUES(${quote(name)}, ${quote(phone)}, ${quote(carrier)}, ${quote(hash)});\n`;
writeFileSync('conta.local.sql', sql);
console.log('\nArquivo conta.local.sql criado. Ele não vai para o GitHub. Cole o conteúdo no Console do D1 e apague o arquivo depois.');
