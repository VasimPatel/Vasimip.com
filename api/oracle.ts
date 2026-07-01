/**
 * [PHASE 2] Ask the Codex — the oracle (brief §4.6). NOT part of Core.
 *
 * A serverless function that proxies a model call so the API key lives ONLY on
 * the server and never reaches the client. This is a dormant stub: it returns a
 * diegetic "the spirit sleeps" until an ANTHROPIC_API_KEY is set and the proxy
 * below is implemented. The voice, when awake, is the codex's — archaic, certain,
 * speaking of the owner in the third person, as a record speaks of its subject.
 *
 * Deploy target: Vercel (api/ -> serverless functions). The key is set as a
 * project env var (NOT prefixed VITE_, so it is never inlined into the bundle).
 */

// Loosely typed to avoid a build-time dependency on @vercel/node; this file is
// outside the app tsconfig and runs only on the server.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST.' })
    return
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    // dormant — Core ships without the oracle awake
    res.status(503).json({ voice: 'The spirit bound in this book is not yet awake.' })
    return
  }

  // ── PHASE 2 ────────────────────────────────────────────────────────────────
  // const { question } = req.body ?? {}
  // const answer = await callModel({ key, question, system: CODEX_VOICE })
  // res.status(200).json({ voice: answer })   // never return `key`
  // ────────────────────────────────────────────────────────────────────────────
  res.status(501).json({ voice: 'The oracle is not yet implemented.' })
}
