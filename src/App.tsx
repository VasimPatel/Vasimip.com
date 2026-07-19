import { lazy, Suspense, useEffect, useState } from 'react'
import Notebook from './notebook/Notebook'
import type { NotebookDoc } from './notebook/doc/validate'
import { loadDoc } from './admin/docStore'
import { useSession } from './admin/auth-client'

// The admin now ships in production at /admin — the server (`requireOwner`) is the
// real boundary, so the client gate is purely cosmetic. The lazy chunk always
// exists in the bundle now (fine).
const Admin = lazy(() => import('./admin/Admin'))
const Login = lazy(() => import('./admin/Login'))
// The friend guestbook builder (/make-a-panel/<token>) — its own lazy chunk;
// the token gets validated server-side, so the route match stays permissive.
const MakeAPanel = lazy(() => import('./friend/MakeAPanel'))

function SpinCard() {
  return (
    <div className="login login-spin">
      <div className="login-card">…unrolling the notebook</div>
    </div>
  )
}

function AdminGate() {
  const { data, isPending, error, refetch } = useSession()

  if (isPending) return <SpinCard />

  // DEV fail-open: `bun run dev` (vite) proxies /api → the bun server, but that
  // server may not be running (file-backed /__notebook admin still works). A
  // NETWORK error (proxy can't reach it → 5xx / no status) in DEV means "no auth
  // server" → let the admin through so offline editing keeps working. Any real
  // 401/403 still shows the Login screen.
  const status = (error as { status?: number } | null)?.status
  const networkish = !!error && (status === undefined || status === 0 || status >= 500)
  const devBypass = import.meta.env.DEV && networkish

  if (data || devBypass) {
    return (
      <Suspense fallback={<SpinCard />}>
        <Admin devBypass={devBypass && !data} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<SpinCard />}>
      <Login onSignedIn={() => refetch()} />
    </Suspense>
  )
}

// The live site: paint instantly from the baked DEFAULT_DOC (doc=undefined), then
// hot-swap to the server's copy once it arrives via the `componentDidUpdate`
// doc-swap contract. Fetch failure (offline / API down) is silent → baked doc
// stays. In dev the Vite middleware serves the SAME file as the baked fallback,
// so there's no visible swap — that's fine.
function SiteNotebook() {
  const [doc, setDoc] = useState<NotebookDoc | undefined>(undefined)
  useEffect(() => {
    const ac = new AbortController()
    loadDoc(ac.signal).then(({ doc: d }) => setDoc(d)).catch(() => {})
    return () => ac.abort()
  }, [])
  return <Notebook doc={doc} />
}

export default function App() {
  if (window.location.pathname === '/admin') return <AdminGate />
  const invite = window.location.pathname.match(/^\/make-a-panel\/([A-Za-z0-9_-]{10,64})\/?$/)
  if (invite) {
    return (
      <Suspense fallback={<SpinCard />}>
        <MakeAPanel token={invite[1]} />
      </Suspense>
    )
  }
  return <SiteNotebook />
}
