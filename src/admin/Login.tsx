// The admin gate's cosmetic front door — the real boundary is `requireOwner` on
// the server. Comic-styled to match DASH'S NOTEBOOK: a parchment card floating on
// the brown deck. Two passwordless ways in: a WebAuthn passkey (primary) or an
// emailed magic link. Only the owner's email can actually get in; everyone else
// sees the same friendly "check your email" so there's no account oracle here.
import { useState } from 'react'
import './admin.css'
import { signIn } from './auth-client'

type Status = 'idle' | 'passkey' | 'sending' | 'sent' | 'error'

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState<string | null>(null)

  const usePasskey = async () => {
    setStatus('passkey'); setErr(null)
    const res = await signIn.passkey()
    if (res?.error) { setStatus('error'); setErr('That passkey didn’t work. Try the email link instead.') }
    else onSignedIn()
  }

  const emailLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending'); setErr(null)
    const res = await signIn.magicLink({ email: email.trim(), callbackURL: '/admin' })
    // Uniform success either way (no enumeration): the server only mails the owner.
    if (res?.error) { setStatus('error'); setErr('Couldn’t send the link. Try again in a moment.') }
    else setStatus('sent')
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-title">WHO GOES THERE?</div>
        <div className="login-sub">this notebook only opens for its keeper</div>

        {status === 'sent' ? (
          <div className="login-sent">
            <div className="login-sent-big">✉ check your inbox</div>
            <div className="login-sent-sm">if that address is the keeper’s, a login link is on its way.</div>
            <button className="login-ghost" onClick={() => setStatus('idle')}>← back</button>
          </div>
        ) : (
          <>
            <button className="login-primary" onClick={usePasskey} disabled={status === 'passkey'}>
              {status === 'passkey' ? '…waiting for your device' : '🔑 use my passkey'}
            </button>

            <div className="login-or"><span>or</span></div>

            <form className="login-email" onSubmit={emailLink}>
              <input
                className="login-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="login-secondary" type="submit" disabled={status === 'sending' || !email.trim()}>
                {status === 'sending' ? '…sending' : '✉ email me a link'}
              </button>
            </form>

            {err && <div className="login-err">{err}</div>}
          </>
        )}
      </div>
    </div>
  )
}
