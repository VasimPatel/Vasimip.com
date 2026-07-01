/**
 * [PHASE 2] Typed client for the oracle (brief §4.6). Talks to /api/oracle,
 * which keeps the key server-side. Dormant in Core; wire <OracleSlot/> into the
 * Arrival and set ANTHROPIC_API_KEY on the host to awaken it.
 */
export interface OracleReply {
  voice: string
  asleep?: boolean
}

export async function askTheCodex(question: string): Promise<OracleReply> {
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    const data = (await res.json()) as { voice?: string }
    return { voice: data.voice ?? 'The book is silent.', asleep: res.status === 503 }
  } catch {
    return { voice: 'The book is silent.', asleep: true }
  }
}
