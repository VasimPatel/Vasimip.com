# Deploying the notebook to Railway

This is your personal deploy runbook. The repo is already Railway-ready: a
`Dockerfile` builds the SPA + Bun/Hono server into one image, and `railway.json`
points the platform at it (health check on `/api/health`). One service, one
Postgres addon.

Everything below is **your** commands to run — nothing here deploys on its own.

---

## 1. Create the project

You can do this entirely from the Railway dashboard, or from the CLI. Pick one.

### Dashboard path

1. Go to <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   pick this repo. Railway reads `railway.json` and builds from the `Dockerfile`.
2. In the project, **New** → **Database** → **Add PostgreSQL**. This creates a
   Postgres service with a `DATABASE_URL` you'll reference below.
3. Open the app service → **Variables** → add the env vars from the table in §2.
4. Open the app service → **Settings** → **Networking** → **Generate Domain** to
   get a `*.up.railway.app` URL. Set `BASE_URL` to that URL (see §2).
5. Railway builds and deploys automatically on push to your default branch.

### CLI path

```sh
npm i -g @railway/cli
railway login                 # opens a browser to authenticate
railway init                  # create a project (or `railway link` to an existing one)
railway add --database postgres   # provision the Postgres addon
# set your variables (repeat --set per var, or use the dashboard):
railway variables --set "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" \
                   --set "OWNER_EMAIL=you@example.com" \
                   --set "BASE_URL=https://<your-app>.up.railway.app"
railway up                    # build + deploy the current directory
railway domain                # generate/print the public URL
```

`DATABASE_URL` is provided by the Postgres addon — reference it rather than
pasting a literal (see §2).

---

## 2. Environment variables

| Variable | Required | What to set it to |
|---|---|---|
| `DATABASE_URL` | yes | **Reference the addon**, don't hardcode. In the dashboard set the value to `${{Postgres.DATABASE_URL}}` (adjust `Postgres` to your DB service name). The server refuses to start without it. |
| `BETTER_AUTH_SECRET` | yes | A 32+ char random secret for signing sessions. Generate: `openssl rand -base64 32`. In production the server **exits** if this is missing or shorter than 32 chars. |
| `OWNER_EMAIL` | yes | The single email allowed to sign in to `/admin`. Every other address is silently refused (no enumeration). Server exits in production if unset. |
| `BASE_URL` | yes | The origin the site is served from. Use the `https://<app>.up.railway.app` URL first; switch to `https://vasimip.com` after DNS cutover (§5). **Must be `https://` in production or the server exits.** Better Auth signs cookies/links against this — it must match the origin you actually visit, or login silently fails. |
| `RESEND_API_KEY` | optional | Resend API key for emailing magic-links. **Without it**, magic-link URLs are printed to the Railway logs instead — fine for the initial bootstrap login. |
| `RESEND_FROM` | optional | The `From` for magic-link emails, e.g. `Notebook <login@vasimip.com>`. Defaults to `Notebook <onboarding@resend.dev>` if unset. Only used when `RESEND_API_KEY` is set. |
| `PORT` | no | **Injected by Railway** — don't set it. The server reads it automatically (falls back to 8787 locally). |

`NODE_ENV=production` is baked into the `Dockerfile`, so the production hardening
(env checks, secure cookies, auth rate-limit) is on automatically.

---

## 3. First-login bootstrap

There are no passwords and no signup — you get in with a one-time magic link, then
register a passkey for Face ID afterward.

1. Deploy, then visit `https://<your-app>.up.railway.app/admin`.
2. Enter your `OWNER_EMAIL` and request the login link.
3. **If you set `RESEND_API_KEY`:** open the email and tap the link.
   **If you didn't:** open the app service → **Deployments** → **View Logs**, find
   the line beginning `[dev magic-link] http://.../api/auth/magic-link/verify?...`
   (it prints even in prod when no Resend key is set) and paste that URL into your
   browser.
4. You're signed in. Click **+ passkey** in the admin header and follow the prompt
   to register this device.
5. From then on, `/admin` offers Face ID / Touch ID — no email round-trip.

---

## 4. Post-deploy verification checklist

Run through these once after the first deploy (replace `$URL` with your app URL):

- **Health:** `curl https://$URL/api/health` → `{"ok":true}`.
- **Site loads:** visit `https://$URL` — the notebook renders and paginates.
- **Login:** complete the §3 magic-link flow; `/admin` shows the editor.
- **Save → revision:** make a small edit in `/admin`, click **save the page**; the
  status chip flips to `saved ✓`. Open the **history ▾** menu — a new revision is
  listed at the top.
- **Invite (owner):** in **FRIENDS' PANELS**, create an invite link, then hit its
  public info endpoint:
  `curl https://$URL/api/invite/<token>` → `{"valid":true,...}`.
  A bogus token returns a uniform `404 {"valid":false}`.
- **Site fallback:** a client route like `https://$URL/admin` resolves (SPA
  fallback) rather than 404ing.

---

## 5. DNS cutover to vasimip.com

Do this **after** the Railway URL is verified working.

1. Railway → app service → **Settings** → **Networking** → **Custom Domain** → add
   `vasimip.com` (and `www` if you want it). Railway shows the DNS records to add.
2. At your DNS provider, add the CNAME/A records Railway gave you. Wait for it to
   verify (Railway shows a green check).
3. **Only then** update `BASE_URL` → `https://vasimip.com` in the app Variables and
   redeploy. (Better Auth must sign against the origin you actually visit; changing
   it before DNS resolves will break login.)
4. Re-run the §4 checklist against `https://vasimip.com`.
5. Retire the old Vercel deploy: delete the Vercel project (it was only the static
   front-end and has no backend). **Then** delete `vercel.json` from the repo — it's
   kept in-tree until cutover so nothing depends on Vercel mid-migration.

---

## 6. Ops notes

- **Content rollback:** every save is an immutable revision. To undo content, open
  `/admin` → **history ▾** → **restore** on any past revision (it writes a *new*
  revision pointing at the old doc — history is never rewritten).
- **Image / code rollback:** Railway → app service → **Deployments** → pick a prior
  successful deployment → **Redeploy** (or **Rollback**).
- **Single replica recommended.** The rate limiter and boot migrations use Postgres
  advisory locks and are correct under concurrency regardless, but there's no reason
  to run more than one instance for this workload — keep the service at 1 replica.
- **Bootstrap without email is fine.** Leaving `RESEND_API_KEY` unset just means
  login links land in the Railway logs. Add Resend later if you want emailed links.
