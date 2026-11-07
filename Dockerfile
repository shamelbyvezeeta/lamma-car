# Lamma Car — production image
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 --home /app lamma && mkdir -p /var/lib/lamma-car/storage && chown -R lamma /var/lib/lamma-car
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=lamma . .
USER lamma
ENV STORAGE_DIR=/var/lib/lamma-car/storage PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run migrations, then start. Migrations are idempotent and guarded by an advisory lock.
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
