// api/index.js
// Same contact-form API as before, adapted to run as a Vercel Serverless
// Function. Vercel automatically maps everything under /api to functions,
// so this file becomes your API entrypoint (see vercel.json for routing).

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
  });
}

module.exports = app;