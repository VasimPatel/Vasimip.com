FROM oven/bun:1

ENV NODE_ENV=production

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Drop privileges: the oven/bun image ships a non-root `bun` user; own the app
# dir so it can read the build output and migrations at runtime.
RUN chown -R bun:bun /app
USER bun

EXPOSE 8787

CMD ["bun", "server/index.ts"]
