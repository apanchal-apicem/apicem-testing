# ---- build: produce the static, minified production bundle ----
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes env vars into the built JS at build time, not at container start -- so this has
# to be a build ARG, not a runtime `environment:` entry in docker-compose.yml (that worked
# for the old dev-server-based image, but silently does nothing for a static build like this
# one). Defaults to same-host-port-8000, matching the app's own LAN-friendly fallback in
# frontend/src/api/client.ts, for a same-host deploy; override at build time for anything else.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- serve: a small, production-grade static file server, not the Vite dev server ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
