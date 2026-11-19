import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS: só aceita pedidos vindos do seu painel
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
}));

// 2. Limite de tamanho do JSON recebido
app.use(express.json({ limit: '16kb' }));

// 3. Limite de frequência: máximo 10 áudios por minuto por IP
const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Muitos pedidos seguidos. Aguarde 1 minuto.' }
});

// Cliente Supabase para validar o token do usuário
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rota de teste para saber se o servidor está vivo
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Rota principal de geração de áudio
app.post('/api/tts', ttsLimiter, async (req, res) => {
  try {
    // 4. Verifica se o frontend enviou o crachá (Bearer Token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    // 5. Valida o texto e a voz enviados
    const { text, voiceId } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'O texto não pode estar vazio.' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ error: 'Texto excede o limite de 2.000 caracteres.' });
    }
    if (!voiceId) {
      return res.status(400).json({ error: 'ID da voz não informado.' });
    }

    // Confere se a voz está na lista permitida (se configurada no .env)
    const allowedVoices = process.env.ALLOWED_VOICE_IDS
      ? process.env.ALLOWED_VOICE_IDS.split(',').map(v => v.trim())
      : [];

    if (allowedVoices.length > 0 && !allowedVoices.includes(voiceId)) {
      return res.status(403).json({ error: 'Voz não autorizada.' });
    }

    // 6. Faz a chamada oficial para a ElevenLabs usando a chave secreta do servidor
    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_multilingual_v2'
        })
      }
    );

    if (!elevenResponse.ok) {
      console.error('Erro ElevenLabs:', elevenResponse.status);
      return res.status(502).json({ error: 'Falha ao gerar áudio no serviço de voz.' });
    }

    // 7. Repassa o áudio MP3 gerado direto para o navegador
    const audioBuffer = Buffer.from(await elevenResponse.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);

  } catch (err) {
    console.error('Erro interno no TTS:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor TTS rodando em http://localhost:${PORT}`);
});