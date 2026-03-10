const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// webhook do Make
const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK;

app.get("/", (req, res) => {
  res.json({ status: "scheduler online" });
});

app.post("/schedule", async (req, res) => {

  const { text, image, platforms, publish_date, publish_time } = req.body;

  try {

    const resp = await fetch(MAKE_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        image,
        platforms,
        publish_date,
        publish_time
      })
    });

    const data = await resp.json();

    res.json({
      ok: true,
      make: data
    });

  } catch (e) {

    res.status(500).json({
      error: e.message
    });

  }

});

app.listen(PORT, () => {
  console.log("Scheduler conectado ao Make");
});
