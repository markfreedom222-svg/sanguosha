FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm resources:install && pnpm build

FROM node:24-bookworm-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3930
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3930
CMD ["node", "--import", "tsx", "src/server/index.ts"]

FROM nginx:stable-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
