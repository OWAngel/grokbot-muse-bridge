FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV STORE_BACKEND=json
RUN mkdir -p /app/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY templates ./templates
COPY .env.example ./
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
