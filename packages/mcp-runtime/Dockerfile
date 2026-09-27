FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["pnpm", "start"]
