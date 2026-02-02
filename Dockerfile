# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build args for Vite env vars (must be at build time)
ARG VITE_WORKOS_CLIENT_ID
ARG VITE_WORKOS_REDIRECT_URI
ARG VITE_WORKOS_PROD_REDIRECT_URI
ARG VITE_API_URL
ARG VITE_SITE_URL

# Set env vars for build
ENV VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID
ENV VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI
ENV VITE_WORKOS_PROD_REDIRECT_URI=$VITE_WORKOS_PROD_REDIRECT_URI
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SITE_URL=$VITE_SITE_URL

# Build the web app
RUN pnpm turbo build --filter=@veto/web

# Production stage - nginx for static files
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA routing config
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
