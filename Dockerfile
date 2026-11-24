FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/hindsight-agent-sdk ./vendor/hindsight-agent-sdk
RUN npm ci --ignore-scripts
COPY . .
RUN ./node_modules/.bin/tsc -p vendor/hindsight-agent-sdk/tsconfig.json && npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /datos/proyecto && chown -R node:node /datos
ENV NODE_ENV=production CN_SERVER_MODE=1 HOST=0.0.0.0 PORT=8080 PROJECT_DIR=/datos/proyecto
USER node
EXPOSE 8080
CMD ["node", "scripts/iniciar-servidor.mjs"]
