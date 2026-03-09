const express = require('express');
const fetch   = require('node-fetch');
const app     = express();

app.use(express.json());

// ── CORS: permite chamadas do seu site Netlify ──────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Variáveis de ambiente (configuradas no Railway) ─────────────────
const BUFFER_TOKEN = process.env.BUFFER_TOKEN;
const PORT         = process.env.PORT || 3000;

// ── Health check ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'MZ Scheduler online ✅', time: new Date().toISOString() });
});

// ── Endpoint principal: recebe post aprovado e agenda no Buffer ─────
app.post('/schedule', async (req, res) => {
  const {
    post_num,
    copy_ig,
    copy_li,
    scheduled_at,
    image_url,
    buffer_channels,
    canal
  } = req.body;

  if (!BUFFER_TOKEN) {
    return res.status(500).json({ error: 'BUFFER_TOKEN não configurado no Railway' });
  }

  if (!scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at ausente no payload' });
  }

  // Determina quais canais usar
  const channels = buffer_channels || {};
  const c = (canal || '').toLowerCase();

  let profileIds = [];
  if (c === 'linkedin' || c === 'li') {
    profileIds = [channels.linkedin_juliana, channels.linkedin_page].filter(Boolean);
  } else if (c === 'instagram' || c === 'ig') {
    profileIds = [channels.instagram].filter(Boolean);
  } else {
    // Padrão: todos (Instagram + LinkedIn)
    profileIds = [
      channels.instagram,
      channels.linkedin_juliana,
      channels.linkedin_page
    ].filter(Boolean);
  }

  const results = [];
  const errors  = [];

  for (const profileId of profileIds) {
    const isLinkedIn = (
      profileId === channels.linkedin_juliana ||
      profileId === channels.linkedin_page
    );

    const text = isLinkedIn ? copy_li : copy_ig;

    // Monta body para a API do Buffer
    const params = new URLSearchParams();
    params.append('profile_ids[]', profileId);
    params.append('text', text || '');
    params.append('scheduled_at', scheduled_at);
    if (image_url) {
      params.append('media[photo]', image_url);
    }

    try {
      const resp = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${BUFFER_TOKEN}`
        },
        body: params.toString()
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        results.push({ profileId, status: 'agendado', update_id: data.updates?.[0]?.id });
      } else {
        errors.push({ profileId, error: data.message || `HTTP ${resp.status}` });
      }
    } catch (e) {
      errors.push({ profileId, error: e.message });
    }
  }

  // Resposta
  if (errors.length === 0) {
    console.log(`✅ POST ${post_num} agendado em ${results.length} canal(is) para ${scheduled_at}`);
    return res.json({ ok: true, agendados: results.length, results });
  } else if (results.length > 0) {
    console.warn(`⚠️ POST ${post_num}: ${results.length} ok, ${errors.length} erro(s)`, errors);
    return res.status(207).json({ ok: 'parcial', results, errors });
  } else {
    console.error(`❌ POST ${post_num}: todos falharam`, errors);
    return res.status(500).json({ ok: false, errors });
  }
});

app.listen(PORT, () => {
  console.log(`MZ Scheduler rodando na porta ${PORT}`);
});
