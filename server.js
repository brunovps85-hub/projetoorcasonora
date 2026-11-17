import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ELEVENLABS_API_KEY'];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN;
const allowedVoiceIds = new Set(
  (process.env.ALLOWED_VOICE_IDS || '')
    .split(',')
    .map((voiceId) => voiceId.trim())
    .filter(Boolean)
);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

app.disable('x-powered-by');

const corsOptions = {
  origin(origin, callback) {
    if (!origin || origin === frontendOrigin) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '16kb' }));

const ttsRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de solicitações atingido. Tente novamente em um minuto.' }
});

async function requireSupabaseUser(req, res, next) {
  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Faça login para gerar locuções.' });

  try {
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    req.authenticatedUser = data.user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Não foi possível validar a sessão.' });
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/tts', ttsRateLimit, requireSupabaseUser, async (req, res) => {
  const { text, voiceId } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    return res.status(400).json({ error: 'O texto é obrigatório e deve ter no máximo 2000 caracteres.' });
  }
  if (typeof voiceId !== 'string' || !allowedVoiceIds.has(voiceId)) {
    return res.status(400).json({ error: 'Voz não permitida.' });
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.15 }
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!upstream.ok) {
      console.error('ElevenLabs TTS request failed with status:', upstream.status);
      return res.status(502).json({ error: 'Falha ao gerar áudio. Tente novamente.' });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': String(audio.length), 'Cache-Control': 'no-store' });
    return res.status(200).send(audio);
  } catch (error) {
    console.error('TTS service error:', error.name || 'UnknownError');
    return res.status(502).json({ error: 'Serviço de voz temporariamente indisponível.' });
  }
});

// Serve the panel through Express so relative /api/tts calls reach this backend.
app.get('/painel.html', async (_req, res, next) => {
  try {
    let html = await readFile(path.join(__dirname, 'painel.html'), 'utf8');
    const configScript = `<script>window.ORCA_CONFIG={supabaseUrl:${JSON.stringify(process.env.SUPABASE_URL)},supabaseAnonKey:${JSON.stringify(process.env.SUPABASE_ANON_KEY)},apiBaseUrl:""};</script>`;
    html = html.replace(/<script\s+src=["']painel\.js["']\s*>\s*<\/script>/i, (tag) => `${configScript}\n${tag}\n<script src="/tts-client.js"></script>`);
    // Never serve a configured TTS secret from frontend JavaScript.
    html = html.replace(/\s*<script[^>]*>[^<]*xi-api-key[^<]*<\/script>/gi, '');
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});

app.get('/painel.js', async (_req, res, next) => {
  try {
    let source = await readFile(path.join(__dirname, 'painel.js'), 'utf8');
    source = source.replace(/const\s+ELEVENLABS_API_KEY\s*=\s*["'][^"']*["'];/, 'const ELEVENLABS_API_KEY = "";');
    res.type('application/javascript').send(source);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname, { dotfiles: 'ignore', index: 'index.html' }));

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin not allowed') return res.status(403).json({ error: 'Origem não permitida.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitação muito grande.' });
  console.error('API error:', error.name || 'UnknownError');
  return res.status(500).json({ error: 'Erro interno.' });
});

app.listen(port, () => console.log(`Orca Sonora web/API listening on port ${port}`));
