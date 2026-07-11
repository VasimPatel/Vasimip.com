// ─────────────────────────────────────────────────────────────────────────────
// Idempotent seed: if `notebook_current` is already set, do nothing. Otherwise
// validate src/notebook/notebook.json against the shared validator and insert
// it as revision 1, then point `notebook_current` at it.
// Usage: `bun run db:seed` (also run on boot before listen — see server/index.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { db } from './index'
import { notebookRevisions, notebookCurrent } from './schema'
import { validateDoc } from '../../src/notebook/doc/validate'
import notebookJson from '../../src/notebook/notebook.json'

export async function seed(): Promise<void> {
  const existing = await db.select().from(notebookCurrent).limit(1)
  if (existing.length > 0) {
    console.log('seed: notebook_current already set, skipping')
    return
  }

  const doc = validateDoc(notebookJson)

  await db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(notebookRevisions)
      .values({ doc, note: 'seed from notebook.json', createdBy: 'seed' })
      .returning({ id: notebookRevisions.id })
    await tx.insert(notebookCurrent).values({ id: 1, revisionId: revision.id })
    console.log(`seed: inserted revision ${revision.id} and set as current`)
  })
}

// Run directly via `bun server/db/seed.ts` / `bun run db:seed`.
if (import.meta.main) {
  await seed()
  process.exit(0)
}
