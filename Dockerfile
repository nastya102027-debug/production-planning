FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci --include=dev
COPY apps ./apps
COPY packages ./packages
RUN npm run db:generate && npm run build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec node apps/api/dist/main.js"]
