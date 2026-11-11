import { digits } from './validation.js';

export const KEYS = {
  PRECISA_DE_PIN: 'PRECISA DE PIN',
  PIN: 'PIN',
  PRONTO_PIN: 'PRONTO PARA PAREAR PIN',
  PAREAR: 'PAREAR',
  PRONTO_CONTATOS: 'PRONTO PARA PAREAR CONTATOS'
};

export const contactKey = n => `CONTATO DE EMERG\u00CANCIA ${n}`;

export function stepLabel(stepKey) {
  const match = /^CONTATO_(\d+)$/.exec(stepKey);
  return match ? contactKey(Number(match[1])) : KEYS[stepKey] || stepKey;
}

export function buildCommand(key, content) {
  return `NONADA${key}: ${content}TRAVESSIA${key}: `;
}

export const gsmPhone = phone => {
  if (!/^\d{11}$/.test(phone)) throw new Error('Telefone inválido para o comando.');
  return `55${phone}`;
};

export const twilioDestination = phone => {
  if (digits(phone).length !== 11) throw new Error('Telefone inválido para o envio.');
  return `+55${phone}`;
};

export const commands = {
  precisaDePin: needsPin => buildCommand(KEYS.PRECISA_DE_PIN, needsPin ? 'SIM' : 'N\u00C3O'),
  pin: pin => {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN inválido.');
    return buildCommand(KEYS.PIN, pin);
  },
  prontoPin: () => buildCommand(KEYS.PRONTO_PIN, 'SIM'),
  contato: (position, phone) => {
    if (!Number.isInteger(position) || position < 1 || position > 10) throw new Error('Posição inválida.');
    return buildCommand(contactKey(position), gsmPhone(phone));
  },
  prontoContatos: () => buildCommand(KEYS.PRONTO_CONTATOS, 'SIM'),
  parear: () => buildCommand(KEYS.PAREAR, 'SIM')
};
