FROM oven/bun:1

ENV NODE_ENV=production

WORKDIR /app

# Copy the root manifest + every workspace manifest before install, so bun can
# resolve/link the packages/* workspaces. Keeping this to just the manifests
# preserves the layer-caching intent: the install layer only busts when a
# package.json or the lockfile changes, not on every source edit.
COPY package.json bun.lock ./
COPY packages/schema/package.json ./packages/schema/
COPY packages/engine/package.json ./packages/engine/
COPY packages/headless/package.json ./packages/headless/
COPY packages/renderer-svg/package.json ./packages/renderer-svg/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Drop privileges: the oven/bun image ships a non-root `bun` user; own the app
# dir so it can read the build output and migrations at runtime.
RUN chown -R bun:bun /app
USER bun

EXPOSE 8787

CMD ["bun", "server/index.ts"]
