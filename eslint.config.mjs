export default [
  {
    // Skip build artifacts and TypeScript files until a TypeScript-aware parser is available locally.
    ignores: ["node_modules", ".next", "dist", "out", "public", "**/*.ts", "**/*.tsx"],
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
    },
  },
]
