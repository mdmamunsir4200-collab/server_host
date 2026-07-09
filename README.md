# Portfolio Contact Server

Small Express API that receives the contact form submissions from
`index.html` (the `#contact` section) and emails them to you via Nodemailer,
rotating across up to 3 Gmail accounts if one fails.

## How it connects to the site

- The site's contact form (in the `<script>` at the bottom of `index.html`)
  POSTs JSON to the URL in `CONTACT_API_URL`:

  ```js
  const CONTACT_API_URL = "http://localhost:3001/api/contact";
  ```

- This server listens on `POST /api/contact` for exactly that payload shape:
  `{ name, email, subject, message }`.

- Once you deploy this server, update `CONTACT_API_URL` in `index.html` to
  your real server URL (e.g. `https://your-app.onrender.com/api/contact`),
  then re-upload/redeploy the site.

## 1. Install dependencies

```bash
cd contact-server
npm install
```

## 2. Get Gmail App Passwords

Regular Gmail passwords won't work with Nodemailer. For each Gmail account
you want to send from:

1. Turn on 2-Step Verification on that Google account.
2. Go to https://myaccount.google.com/apppasswords
3. Generate an app password (choose "Mail" as the app).
4. Copy the 16-character password — you'll paste it into `.env`.

You only need 1 account to get started. Accounts #2 and #3 are optional
fallbacks used only if #1 fails (e.g. hits Gmail's ~500/day sending cap).

## 3. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` and fill in:
- `GMAIL_USER_1` / `GMAIL_PASS_1` (required)
- `GMAIL_USER_2` / `GMAIL_PASS_2`, `GMAIL_USER_3` / `GMAIL_PASS_3` (optional)
- `CONTACT_TO_EMAIL` — the inbox that should receive submissions
- `ALLOWED_ORIGINS` — your site's real URL once deployed (comma-separated
  if you have more than one, e.g. a custom domain + a Vercel preview URL)

**Never commit your real `.env` file.** `.gitignore` already excludes it.

## 4. Run locally

```bash
npm start
```

Server runs on `http://localhost:3001` by default. Test it:

```bash
curl http://localhost:3001/health
# {"ok":true}

curl -X POST http://localhost:3001/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","subject":"Hi","message":"Testing the form"}'
```

Then open `index.html` in a local dev server (not `file://`, since `fetch`
needs a proper origin) and submit the contact form — you should receive an
email and see "Sent ✓" on the button.

## 5. Deploy

Any Node host works (Render, Railway, Fly.io, etc.). General steps for Render:

1. Push this `contact-server/` folder to a GitHub repo.
2. Create a new **Web Service** on Render, pointing at that repo.
3. Build command: `npm install` — Start command: `npm start`
4. Add all the variables from `.env` as environment variables in Render's
   dashboard (do this instead of uploading `.env`).
5. Once deployed, copy the live URL (e.g. `https://your-app.onrender.com`)
   and:
   - Set `ALLOWED_ORIGINS` in Render to your real site domain.
   - Update `CONTACT_API_URL` in `index.html` to
     `https://your-app.onrender.com/api/contact`.

## Notes

- If all configured Gmail accounts fail, the API returns HTTP 502 and the
  frontend shows an inline error with your fallback email address.
- Gmail's free sending limit is roughly 500 emails/day per account — the
  rotation across 3 accounts is just a buffer against hitting that cap, not
  a way to send bulk/marketing email (that would violate Gmail's terms).
