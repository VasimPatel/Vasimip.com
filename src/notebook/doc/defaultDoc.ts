// ─────────────────────────────────────────────────────────────────────────────
// The shipped document. Validated once at module load so a malformed
// notebook.json fails fast (build time / first import) rather than at
// arbitrary render time.
// ─────────────────────────────────────────────────────────────────────────────
import notebookJson from '../notebook.json'
import { validateDoc } from './validate'
import type { NotebookDoc } from './docTypes'

export const DEFAULT_DOC: NotebookDoc = validateDoc(notebookJson)
