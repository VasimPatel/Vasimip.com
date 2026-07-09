import { lazy, Suspense } from 'react'
import Notebook from './notebook/Notebook'

// Dev-only WYSIWYG admin at /admin. `import.meta.env.DEV` is statically replaced
// at build time, so in production this const is `null` and the dynamic import
// (plus the entire src/admin tree) is dead-code-eliminated from the bundle.
const Admin = import.meta.env.DEV ? lazy(() => import('./admin/Admin')) : null

export default function App() {
  if (Admin && window.location.pathname === '/admin') {
    return (
      <Suspense fallback={<div style={{ padding: 24, fontFamily: 'system-ui' }}>loading admin…</div>}>
        <Admin />
      </Suspense>
    )
  }
  return <Notebook />
}
