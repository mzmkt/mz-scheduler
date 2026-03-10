const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ── CORS ─────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const BUFFER_TOKEN = process.env.BUFFER_TOKEN;
const PORT = process.env.PORT || 3000;

// ── Health check ─────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'MZ Scheduler online',
    time: new Date().toISOString()
  });
});

// ── GraphQL helper ───────────────
async function bufferGraphQL(query, variables = {}) {
  const resp = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BUFFER_TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });

  return resp.json();
}

// ── Buscar canais ────────────────
async function getChannels() {
  const data = await bufferGraphQL(`
    query {
      channels(input: {}) {
        id
        name
        service
      }
    }
  `);

  return data?.data?.channels || [];
}

// ── Criar post no Buffer ─────────
async function createPost(channelId, text, scheduledAt, imageUrl) {

  const mutation = `
    mutation CreatePost($input: PostCreateInput!) {
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
      channelId: channelId,
      text: text,
      schedulingType: "SCHEDULED",
      dueAt: scheduledAt,
      media: imageUrl
        ? { photoUrl: imageUrl }
        : null
    }
  };

  return bufferGraphQL(mutation, variables);
}

// ── Endpoint de debug canais ─────
app.get('/channels', async (req, res) => {
  try {
    const channels = await getChannels();
    res.json(channels);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Endpoint principal ───────────
app.post('/schedule', async (req, res) => {

  const {
    post_num,
    copy_ig,
    copy_li,
    scheduled_at,
    canal,
    image_url
  } = req.body;

  if (!BUFFER_TOKEN) {
    return res.status(500).json({ error: 'BUFFER_TOKEN não configurado' });
  }

  let channels;

  try {
    channels = await getChannels();
  } catch (e) {
    return res.status(500).json({
      error: 'Erro ao buscar canais',
      message: e.message
    });
  }

  const igChannel = channels.find(c => c.service === 'instagram');
  const liChannels = channels.filter(c => c.service === 'linkedin');

  let profileIds = [];

  const c = (canal || '').toLowerCase();

  if (c === 'instagram' || c === 'ig') {

    if (igChannel)
      profileIds.push({
        id: igChannel.id,
        text: copy_ig
      });

  } else if (c === 'linkedin' || c === 'li') {

    liChannels.forEach(ch =>
      profileIds.push({
        id: ch.id,
        text: copy_li
      })
    );

  } else {

    if (igChannel)
      profileIds.push({
        id: igChannel.id,
        text: copy_ig
      });

    liChannels.forEach(ch =>
      profileIds.push({
        id: ch.id,
        text: copy_li
      })
    );
  }

  if (!profileIds.length) {
    return res.status(400).json({
      error: 'Nenhum canal encontrado'
    });
  }

  const results = [];
  const errors = [];

  for (const profile of profileIds) {

    try {

      const data = await createPost(
        profile.id,
        profile.text,
        scheduled_at,
        image_url
      );

      const result = data?.data?.createPost;

      if (result?.post?.id) {

        results.push({
          channelId: profile.id,
          postId: result.post.id,
          status: result.post.status
        });

      } else if (result?.message) {

        errors.push({
          channelId: profile.id,
          error: result.message
        });

      } else if (data?.errors) {

        errors.push({
          channelId: profile.id,
          error: data.errors.map(e => e.message).join(', ')
        });

      } else {

        errors.push({
          channelId: profile.id,
          error: JSON.stringify(data)
        });

      }

    } catch (e) {

      errors.push({
        channelId: profile.id,
        error: e.message
      });

    }

  }

  console.log(`POST ${post_num}`, { results, errors });

  if (errors.length === 0) {
    return res.json({
      ok: true,
      agendados: results.length,
      results
    });
  }

  if (results.length > 0) {
    return res.status(207).json({
      ok: "parcial",
      results,
      errors
    });
  }

  return res.status(500).json({
    ok: false,
    errors
  });

});

app.listen(PORT, () => {
  console.log(`MZ Scheduler rodando na porta ${PORT}`);
});
