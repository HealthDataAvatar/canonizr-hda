FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/vitest.integration.ts ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tests ./tests
COPY --from=builder /app/stubs ./stubs

CMD ["npx", "vitest", "run", "--config", "vitest.integration.ts"]
