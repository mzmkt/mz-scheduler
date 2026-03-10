const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BUFFER_TOKEN = process.env.BUFFER_TOKEN;

// ── CORS ─────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// ── Health Check ─────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'MZ Scheduler online',
    time: new Date().toISOString()
  });
});

// ── Helper GraphQL ───────────────────────────
async function bufferGraphQL(query, variables = {}) {

  const response = await fetch(
    'https://api.buffer.com/graphql',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BUFFER_TOKEN}`
      },
      body: JSON.stringify({
        query,
        variables
      })
    }
  );

  const data = await response.json();

  return data;
}

// ── Buscar canais do Buffer ──────────────────
async function getChannels() {

  const query = `
    query {
      viewer {
        channels {
          id
          name
          service
        }
      }
    }
  `;

  const data = await bufferGraphQL(query);

  return data?.data?.viewer?.channels || [];
}

// ── Criar post ───────────────────────────────
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

  const data = await bufferGraphQL(mutation, variables);

  return data;
}

// ── Endpoint debug canais ────────────────────
app.get('/channels', async (req, res) => {

  try {

    const channels = await getChannels();

    res.json(channels);

  } catch (e) {

    res.status(500).json({
      error: e.message
    });

  }

});

// ── Endpoint principal ───────────────────────
app.post('/schedule', async (req, res) => {

  if (!BUFFER_TOKEN) {
    return res.status(500).json({
      error: "BUFFER_TOKEN não configurado"
    });
  }

  const {
    post_num,
    copy_ig,
    copy_li,
    scheduled_at,
    canal,
    image_url
  } = req.body;

  let channels;

  try {

    channels = await getChannels();

  } catch (e) {

    return res.status(500).json({
      error: "Erro ao buscar canais",
      message: e.message
    });

  }

  if (!channels.length) {
    return res.status(500).json({
      error: "Nenhum canal encontrado no Buffer"
    });
  }

  const igChannel = channels.find(c => c.service === 'instagram');
  const liChannels = channels.filter(c => c.service === 'linkedin');

  let targets = [];

  const c = (canal || '').toLowerCase();

  if (c === "instagram" || c === "ig") {

    if (igChannel) {
      targets.push({
        id: igChannel.id,
        text: copy_ig
      });
    }

  } else if (c === "linkedin" || c === "li") {

    liChannels.forEach(ch => {

      targets.push({
        id: ch.id,
        text: copy_li
      });

    });

  } else {

    if (igChannel) {
      targets.push({
        id: igChannel.id,
        text: copy_ig
      });
    }

    liChannels.forEach(ch => {

      targets.push({
        id: ch.id,
        text: copy_li
      });

    });

  }

  if (!targets.length) {
    return res.status(400).json({
      error: "Nenhum canal compatível encontrado"
    });
  }

  const results = [];
  const errors = [];

  for (const t of targets) {

    try {

      const response = await createPost(
        t.id,
        t.text,
        scheduled_at,
        image_url
      );

      const result = response?.data?.createPost;

      if (result?.post?.id) {

        results.push({
          channelId: t.id,
          postId: result.post.id,
          status: result.post.status
        });

      } else if (result?.message) {

        errors.push({
          channelId: t.id,
          error: result.message
        });

      } else if (response?.errors) {

        errors.push({
          channelId: t.id,
          error: response.errors.map(e => e.message).join(', ')
        });

      } else {

        errors.push({
          channelId: t.id,
          error: JSON.stringify(response)
        });

      }

    } catch (e) {

      errors.push({
        channelId: t.id,
        error: e.message
      });

    }

  }

  console.log(`POST ${post_num}`, {
    results,
    errors
  });

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

// ── Start server ─────────────────────────────
app.listen(PORT, () => {

  console.log(`MZ Scheduler rodando na porta ${PORT}`);

});
