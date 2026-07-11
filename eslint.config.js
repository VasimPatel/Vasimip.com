// Determinism lint (ENGINE_V2 §3 rule 1). Bans wall-clock and unseeded-random
// sources inside the simulation packages so replay/hash identity can't silently
// rot. SCOPED to packages/engine + packages/headless ONLY — the site, server,
// and scripts are never linted here, so no existing code needs to change.
import tsParser from '@typescript-eslint/parser'

const RANDOM = 'Determinism: use the seeded EngineContext rng, never Math.random.'
const CLOCK = 'Determinism: derive time from the sim clock (tick count), never a wall clock.'

export default [
  {
    files: ['packages/engine/**/*.ts', 'packages/headless/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: RANDOM },
        { object: 'Date', property: 'now', message: CLOCK },
        { object: 'performance', property: 'now', message: CLOCK },
      ],
      // Bans referencing the `Date` / `performance` globals at all (covers
      // `new Date()`, `Date.now()`, `performance.now()`), unless shadowed locally.
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: CLOCK },
        { name: 'performance', message: CLOCK },
      ],
    },
  },
]
