const express = require('express');
const fetch   = require('node-fetch');
const app     = express();

app.use(express.json());

// ── CORS ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const BUFFER_TOKEN = process.env.BUFFER_TOKEN;
const PORT         = process.env.PORT || 3000;

// ── Health check ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'MZ Scheduler online ✅', time: new Date().toISOString() });
});

// ── Buffer GraphQL API ──────────────────────────────────────────────
async function bufferGraphQL(query, variables) {
  const resp = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${BUFFER_TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });
  return resp.json();
}

// Busca os channelIds reais da conta Buffer
async function getChannels() {
  const data = await bufferGraphQL(`
    query {
      channels {
        id
        name
        service
        serviceId
      }
    }
  `);
  return data?.data?.channels || [];
}

// Agenda um post no Buffer via GraphQL (sintaxe correta)
async function createPost(channelId, text, scheduledAt, imageUrl) {
  const mutation = `
    mutation CreatePost {
      createPost(input: {
        text: ${JSON.stringify(text)},
        channelId: ${JSON.stringify(channelId)},
        schedulingType: scheduled,
        mode: customSchedule,
        dueAt: ${JSON.stringify(scheduledAt)}
      }) {
        ... on PostActionSuccess {
          post {
            id
            status
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const resp = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${BUFFER_TOKEN}`
    },
    body: JSON.stringify({ query: mutation })
  });
  return resp.json();
}

// ── Endpoint principal ──────────────────────────────────────────────
app.post('/schedule', async (req, res) => {
  const { post_num, copy_ig, copy_li, scheduled_at, image_url, buffer_channels, canal } = req.body;

  if (!BUFFER_TOKEN) {
    return res.status(500).json({ error: 'BUFFER_TOKEN não configurado' });
  }

  const c = (canal || '').toLowerCase();
  const ch = buffer_channels || {};

  // Determina quais canais usar
  let profileIds = [];
  if (c === 'linkedin' || c === 'li') {
    profileIds = [
      { id: ch.linkedin_juliana, text: copy_li },
      { id: ch.linkedin_page,    text: copy_li }
    ];
  } else if (c === 'instagram' || c === 'ig') {
    profileIds = [
      { id: ch.instagram, text: copy_ig }
    ];
  } else {
    profileIds = [
      { id: ch.instagram,        text: copy_ig },
      { id: ch.linkedin_juliana, text: copy_li },
      { id: ch.linkedin_page,    text: copy_li }
    ];
  }

  const results = [];
  const errors  = [];

  for (const profile of profileIds) {
    if (!profile.id) continue;
    try {
      const data = await createPost(profile.id, profile.text || '', scheduled_at, image_url);
      const result = data?.data?.createPost;

      if (result?.post?.id) {
        results.push({ channelId: profile.id, postId: result.post.id, status: result.post.status });
      } else if (result?.message) {
        errors.push({ channelId: profile.id, error: result.message });
      } else if (data?.errors) {
        errors.push({ channelId: profile.id, error: data.errors.map(e => e.message).join(', ') });
      } else {
        errors.push({ channelId: profile.id, error: JSON.stringify(data) });
      }
    } catch(e) {
      errors.push({ channelId: profile.id, error: e.message });
    }
  }

  console.log(`POST ${post_num}: ${results.length} ok, ${errors.length} erros`, { results, errors });

  if (errors.length === 0) {
    return res.json({ ok: true, agendados: results.length, results });
  } else if (results.length > 0) {
    return res.status(207).json({ ok: 'parcial', results, errors });
  } else {
    return res.status(500).json({ ok: false, errors });
  }
});

app.listen(PORT, () => {
  console.log(`MZ Scheduler rodando na porta ${PORT}`);
});
