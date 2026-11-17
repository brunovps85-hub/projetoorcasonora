# Backend TTS (Node.js/Express)

Este serviço mantém a chave da ElevenLabs no servidor e exige uma sessão Supabase válida para gerar áudio.

## Requisitos e configuração

- Node.js 20 ou superior.
- Um serviço de hospedagem que execute processos Node.js (GitHub Pages não executa Express).
- No painel de hospedagem, configure as variáveis do `.env.example`. Não envie o `.env` para o Git.
- Revogue a chave ElevenLabs que já foi publicada e gere uma chave nova; salve-a somente como `ELEVENLABS_API_KEY` no ambiente do servidor.
- Configure `FRONTEND_ORIGIN` como a origem exata do painel.

Localmente:

```sh
cp .env.example .env
# Edite .env e insira os valores reais, incluindo a NOVA chave da ElevenLabs.
npm install
npm run dev
```

A API fica em `http://localhost:3000`. O endpoint `GET /health` testa se o servidor está ativo.

## Conectar o frontend

A chamada `POST /api/tts` deve incluir o access token da sessão Supabase. Atualize a função de geração no `painel.js` para enviar o token no cabeçalho:

```js
const { data: { session } } = await supabaseClient.auth.getSession();
if (!session?.access_token) throw new Error('Faça login para gerar locuções.');

const response = await fetch(`${window.ORCA_CONFIG.apiBaseUrl}/api/tts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`
  },
  body: JSON.stringify({ text: texto, voiceId: voiceIdEspecifico })
});
```

`window.ORCA_CONFIG.apiBaseUrl` deve ser a URL pública do backend (por exemplo, `https://api.example.com`). Se frontend e backend forem servidos pela mesma origem, pode-se usar `/api/tts` diretamente.

O painel precisa iniciar uma sessão Supabase pelo fluxo de login antes de solicitar TTS. A chave publishable/anon do Supabase pode ser usada no navegador, mas não substitui autenticação nem políticas RLS; nunca coloque a `service_role` no frontend.

## Proteções incluídas

- Validação de JWT do Supabase em cada solicitação.
- Limite de 10 pedidos por minuto por IP.
- Lista permitida de IDs de voz configurável.
- Validação do texto (máximo de 2.000 caracteres) e limite de corpo JSON.
- CORS restrito à origem configurada.
- Respostas de erro sem detalhes da ElevenLabs.

## Importante

O histórico do Git ainda contém a chave antiga. Revogá-la é indispensável. Apagar o segredo do arquivo atual não o remove dos commits antigos; para eliminar a ocorrência histórica, será necessário reescrever o histórico do Git e coordenar isso com todos os clones/colaboradores.
