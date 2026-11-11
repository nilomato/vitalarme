# VitalArme

Protótipo escolar para configuração de dispositivo de segurança e contatos de emergência. Não é um sistema de emergência certificado.

## Status

Frontend em HTML, CSS e JavaScript puro, mais uma API em Cloudflare Workers com banco Cloudflare D1. O envio de SMS pelo Twilio existe no código, mas fica **desativado por padrão** (`SMS_ENABLED=false`).

## Estrutura

```
vitalarme/
├── public/            site (arquivos estáticos servidos pelo Worker)
├── worker/            API: entrada, rotas, autenticação, banco, protocolo, Twilio, pareamento
├── migrations/        SQL do banco D1
├── scripts/           criação de contas (uso local do administrador)
├── tests/             testes automatizados
├── docs/GUIA.md       passo a passo de Cloudflare, D1, Secrets e Twilio
├── wrangler.jsonc     configuração do Worker (referência para os deploys)
└── package.json
```

## Como funciona

- O navegador chama `/api/...` na mesma origem do site.
- Login com telefone completo com DDD. Contas são criadas pelo administrador; não existe cadastro público.
- O site guarda dispositivo, idoso e até 10 contatos. O histórico registra apenas ações feitas no site.
- O fluxo de pareamento pede ao Twilio o envio dos comandos por SMS. O site não recebe respostas do GSM: o próprio usuário confirma o pareamento depois de receber a mensagem no telefone.
- O Simulador continua existindo, apenas visual. Seus eventos não são gravados.

## Testes

```
npm install
npm test
```

Os testes não enviam SMS nem acessam a internet.

## Publicação

Veja `docs/GUIA.md`.

## Avisos

- Aceitação pelo Twilio não significa entrega do SMS, nem interpretação pelo dispositivo, nem pareamento.
- "SMS + chamada" é uma preferência guardada no site; o protocolo atual não tem comando para ela.
- Custos de SMS dependem da sua conta Twilio. Nada é prometido como gratuito.
