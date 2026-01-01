# Vasimip.com

This repository contains the source for a Next.js web app. Use the steps below to get the project running locally for development or to create a production build.

## Prerequisites

- **Node.js 18.18+** (aligns with Next.js 15 requirements)
- **pnpm** (preferred package manager; install from [pnpm.io](https://pnpm.io/installation))

> If you prefer `npm` or `yarn`, adjust the commands below accordingly.

## Install dependencies

From the project root:

```bash
pnpm install
```

## Run the app in development

Start the dev server (default: http://localhost:3000):

```bash
pnpm dev
```

The server reloads when you edit files.

## Build and run in production mode

Create an optimized build, then start it:

```bash
pnpm build
pnpm start
```

The `start` command serves the prebuilt app on port 3000 by default.

## Lint the project

Run ESLint to check for issues:

```bash
pnpm lint
```

## Additional notes

- No environment variables are required for local development.
- Component and architecture details live in `DOCUMENTATION.md` if you want to understand the composition notebook feature.
