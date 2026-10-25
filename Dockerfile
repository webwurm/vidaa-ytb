# Build stage: runs on the build machine's native platform, the output is plain JS/HTML
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run package:vidaa

# Runtime stage: the proxy only needs Node built-ins, no node_modules
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/api ./api
COPY --from=build /app/scripts/serve-vidaa.mjs ./scripts/
COPY --from=build /app/dist/vidaa ./dist/vidaa
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/manifest.json || exit 1
CMD ["node", "scripts/serve-vidaa.mjs"]
