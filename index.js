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

// Agenda um post no Buffer via GraphQL (sintaxe oficial da documentação)
async function createPost(channelId, text, scheduledAt) {

  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
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

  const variables = {
    input: {
      text: text,
      channelId: channelId,
      schedulingType: "custom",
      dueAt: scheduledAt
    }
  };

  return bufferGraphQL(mutation, variables);
}
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

// Busca os channelIds reais da conta (nova API GraphQL)
app.get('/channels', async (req, res) => {
  const data = await bufferGraphQL(`
    query {
      channels {
        id
        name
        service
      }
    }
  `);
  res.json(data);
});

// ── Endpoint principal ──────────────────────────────────────────────
app.post('/schedule', async (req, res) => {
  const { post_num, copy_ig, copy_li, scheduled_at, canal } = req.body;

  if (!BUFFER_TOKEN) {
    return res.status(500).json({ error: 'BUFFER_TOKEN não configurado' });
  }

  // Busca os channelIds reais da nova API GraphQL do Buffer
  let channels = [];
  try {
    const chData = await bufferGraphQL(`query { channels { id name service } }`);
    channels = chData?.data?.channels || [];
    console.log('Canais encontrados:', channels.map(c => `${c.service}:${c.name}:${c.id}`));
  } catch(e) {
    return res.status(500).json({ error: 'Falha ao buscar canais: ' + e.message });
  }

  if (!channels.length) {
    return res.status(500).json({ error: 'Nenhum canal encontrado na conta Buffer' });
  }

  const c = (canal || '').toLowerCase();

  // Mapeia canais por serviço
  const igChannel   = channels.find(ch => ch.service === 'instagram');
  const liChannels  = channels.filter(ch => ch.service === 'linkedin');

  let profileIds = [];
  if (c === 'linkedin' || c === 'li') {
    profileIds = liChannels.map(ch => ({ id: ch.id, text: copy_li }));
  } else if (c === 'instagram' || c === 'ig') {
    if (igChannel) profileIds = [{ id: igChannel.id, text: copy_ig }];
  } else {
    // Padrão: todos
    if (igChannel) profileIds.push({ id: igChannel.id, text: copy_ig });
    liChannels.forEach(ch => profileIds.push({ id: ch.id, text: copy_li }));
  }

  if (!profileIds.length) {
    return res.status(400).json({ error: 'Nenhum canal compatível encontrado para canal: ' + canal });
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
