/**
 * [PHASE 2] Ask the Codex — the diegetic oracle interface (brief §4.6). A spirit
 * bound in the book, not a chat bubble. DORMANT in Core: this component exists
 * and works, but is intentionally NOT rendered in the live Codex. To awaken it,
 * render <OracleSlot/> inside the Arrival's DepthSection and set ANTHROPIC_API_KEY
 * on the host so api/oracle.ts can answer.
 */
import { useState, type FormEvent } from 'react'
import { askTheCodex } from '@/lib/oracle/client'

export function OracleSlot() {
  const [q, setQ] = useState('')
  const [voice, setVoice] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    if (!q.trim() || asking) return
    setAsking(true)
    const reply = await askTheCodex(q.trim())
    setVoice(reply.voice)
    setAsking(false)
  }

  return (
    <form className="oracle reveal" onSubmit={ask}>
      <label className="marginalia" htmlFor="oracle-q">
        Ask the codex of its subject —
      </label>
      <input
        id="oracle-q"
        className="oracle-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="What does the book know?"
        autoComplete="off"
      />
      {voice ? <p className="oracle-voice">{voice}</p> : null}
    </form>
  )
}
