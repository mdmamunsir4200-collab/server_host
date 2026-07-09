// api/index.js
// Same contact-form API as before, adapted to run as a Vercel Serverless
// Function. Vercel automatically maps everything under /api to functions,
// so this file becomes your API entrypoint (see vercel.json for routing).
//
// Now also includes /api/chat, which proxies to OpenRouter using rotated
// API keys stored as environment variables — never in client code.



const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        allowedOrigins.includes("*") ||
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

// ---- Rotation of sender accounts ----
const ACCOUNTS = [
  { user: process.env.GMAIL_USER_1, pass: process.env.GMAIL_PASS_1 },
  { user: process.env.GMAIL_USER_2, pass: process.env.GMAIL_PASS_2 },
  { user: process.env.GMAIL_USER_3, pass: process.env.GMAIL_PASS_3 },
].filter((a) => a.user && a.pass);

const CONTACT_TO_EMAIL =
  process.env.CONTACT_TO_EMAIL || (ACCOUNTS[0] && ACCOUNTS[0].user);

function buildTransport(account) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: account.user, pass: account.pass },
  });
}

async function sendWithRotation({ name, email, subject, message }) {
  if (ACCOUNTS.length === 0) {
    throw new Error(
      "No sender accounts configured. Set GMAIL_USER_1/GMAIL_PASS_1 etc. as Vercel env vars.",
    );
  }

  const mailSubject = "Portfolio Contact: " + (subject || "New message");
  const mailText =
    `Name: ${name}\n` +
    `Email: ${email}\n` +
    `Subject: ${subject || "(none)"}\n\n` +
    `${message}`;

  let lastError = null;

  for (const account of ACCOUNTS) {
    try {
      const transporter = buildTransport(account);
      await transporter.sendMail({
        from: `"Portfolio Contact Form" <${account.user}>`,
        to: CONTACT_TO_EMAIL,
        replyTo: email,
        subject: mailSubject,
        text: mailText,
      });
      return { sentFrom: account.user };
    } catch (err) {
      console.warn(`Send failed from ${account.user}:`, err.message);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All sender accounts failed");
}

app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "name, email, and message are required.",
    });
  }

  try {
    const result = await sendWithRotation({ name, email, subject, message });
    return res.json({ success: true, sentFrom: result.sentFrom });
  } catch (err) {
    console.error("All accounts failed:", err.message);
    return res.status(502).json({
      success: false,
      message: "Could not send message right now. Please try again later.",
    });
  }
});

// ================= CHAT (OpenRouter) =================
// API keys live only in env vars: OPENROUTER_API_KEY_1 .. OPENROUTER_API_KEY_N
// Set as many as you have in Vercel → Project Settings → Environment Variables.

const OPENROUTER_KEYS = [];
for (let i = 1; i <= 20; i++) {
  const key = process.env["OPENROUTER_API_KEY_" + i];
  if (key) OPENROUTER_KEYS.push(key);
}

const CHAT_SYSTEM_PROMPT = `You are a helpful AI assistant on MD Asraful Islam's personal portfolio website. Answer questions about Asraful in a friendly, professional tone.

About him:
- Name: MD Asraful Islam
- Role: Full-Stack Developer (self-taught, from Bangladesh)
- Status: Available for hire, internships, freelance, collaborations
- Superpower: Adapts to new technologies fast, always curious and learning

HIGH FOCUS skills: HTML5, CSS3, JS ES6+, SCSS, Tailwind, React.js, Next.js, Angular, Redux, Node.js, Express.js, Django, FastAPI, .NET, PostgreSQL, MongoDB, Redis, Firebase, Elasticsearch, Scikit-learn, TensorFlow, Pandas, NumPy, VS Code, Git/GitHub, Jupyter. Also actively uses AI technologies: ChatGPT, Claude, DeepSeek, Google AI Studio, and Ollama for local models.

MID LEVEL: Flutter, Rx-Dart, Provider, BLoC, Android (Java), Socket.IO, WebRTC, Puppeteer, MobX, NgRx, Nuxt.js, Vue.js, Vuex, jQuery, Bootstrap, Laravel, MySQL, Adobe XD, Illustrator

Projects:
1. NexTrade (https://nex-client-kappa.vercel.app/) — built with Angular, Express.js, and SCSS, using Firebase, deployed on Vercel.
2. Chain Hook Wallet (https://chain-hook-client.vercel.app) — built with React.js, Django, and Tailwind CSS, using PostgreSQL, deployed on Vercel.
3. Lyren (https://lyren-client.vercel.app) — built with Next.js, .NET, PostgreSQL, and Redis, styled with raw CSS, deployed on Vercel and Render.

Contact: asraful808088@email.com | https://github.com/asraful808088 | linkedin.com/in/md-asraful-399a86250 | x.com/asraful808088 | kaggle.com/mdasraful00000000 | Bangladesh

Keep answers concise, warm, and encouraging.`;

// Tracks keys that failed auth/billing within this warm instance, so we
// don't keep retrying a dead key on every request until cold start.
const failedOpenRouterKeys = new Set();

app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body || {};

  if (!message || typeof message !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "message is required." });
  }

  if (OPENROUTER_KEYS.length === 0) {
    return res.status(500).json({
      success: false,
      message:
        "No OpenRouter keys configured. Set OPENROUTER_API_KEY_1, _2, etc. as Vercel env vars.",
    });
  }

  const messages = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...(Array.isArray(history) ? history : []),
    { role: "user", content: message },
  ];

  const maxAttempts = OPENROUTER_KEYS.length * 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = OPENROUTER_KEYS[attempt % OPENROUTER_KEYS.length];
    if (failedOpenRouterKeys.has(apiKey)) continue;

    try {
      const upstream = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages,
            temperature: 0.8,
          }),
        },
      );

      if (upstream.ok) {
        const data = await upstream.json();
        const reply =
          data.choices?.[0]?.message?.content || "Sorry, no response.";
        return res.json({ success: true, reply });
      }

      if (upstream.status === 401 || upstream.status === 402) {
        failedOpenRouterKeys.add(apiKey);
        continue;
      }
      if (upstream.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (upstream.status >= 500) {
        continue;
      }

      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        success: false,
        message: err?.error?.message || "API error",
      });
    } catch (err) {
      console.warn("OpenRouter request failed:", err.message);
      continue;
    }
  }

  return res.status(502).json({
    success: false,
    message: "All API keys exhausted or failing. Please try again later.",
  });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Only start a listener when running locally (e.g. `node api/index.js` or
// `vercel dev`). On Vercel's production servers, this file is imported as a
// module and the platform itself handles invoking `app` per request.
if (process.env.VERCEL === undefined && require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Contact server running locally on port ${PORT}`);
    console.log(
      `Configured sender accounts: ${ACCOUNTS.map((a) => a.user).join(", ") || "NONE — set .env"}`,
    );
    console.log(
      `Configured OpenRouter keys: ${OPENROUTER_KEYS.length || "NONE — set .env"}`,
    );
  });
}

module.exports = app;
