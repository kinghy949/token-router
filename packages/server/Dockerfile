FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY packages/server packages/server
RUN pnpm -C packages/server prisma:generate
RUN pnpm -C packages/server build

EXPOSE 3000
CMD ["sh", "-c", "pnpm -C packages/server prisma:migrate && pnpm -C packages/server prisma:seed && pnpm -C packages/server start:prod"]
