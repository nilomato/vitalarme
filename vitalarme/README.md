# VitalArme

Protótipo frontend para configuração de dispositivo de segurança e contatos de emergência.

## Status

Protótipo frontend, sem backend.

## Tecnologias

HTML, CSS e JavaScript puro, sem frameworks e sem bibliotecas externas.

## Estrutura de pastas

```
vitalarme/
├── index.html
├── css/
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
├── js/
│   ├── app.js
│   ├── navigation.js
│   ├── forms.js
│   ├── contacts.js
│   ├── simulator.js
│   └── utils.js
├── README.md
└── .gitignore
```

## Como executar localmente

Abra o arquivo `index.html` diretamente no navegador. Não é necessário instalar nada.

Opcionalmente, use um servidor estático local, por exemplo: `python3 -m http.server 8000` e acesse `http://localhost:8000`.

## Como publicar no Cloudflare Pages

1. Envie o projeto para um repositório no GitHub.
2. No painel do Cloudflare, acesse **Workers & Pages** e crie um projeto do tipo **Pages**, conectando ao repositório.
3. Em **Framework preset**, escolha **None**.
4. Deixe o **Build command** vazio.
5. Defina **Build output directory** como `/` (raiz do projeto).
6. Conclua com **Save and Deploy**.

## Avisos

- Não há envio real de SMS.
- Não há login real; o acesso é apenas demonstrativo.
- Não há integração com hardware.
- Os dados ficam somente na memória da página e são perdidos ao recarregá-la.
