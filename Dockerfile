# Use the official Bun image
# See all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.5-alpine AS base

# Set working directory
WORKDIR /usr/src/app

# Install dependencies into temp directory
# This will cache them and speed up future builds
FROM base AS deps
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Set production environment
ENV NODE_ENV=production

# Build stage
FROM base AS build
WORKDIR /usr/src/app

# Copy node modules from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY . .

# Final stage
FROM base
WORKDIR /usr/src/app

# Create a non-root user to run the app
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

# Install Chrome dependencies for Puppeteer
USER root
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy built application
COPY --from=build /usr/src/app .
RUN chown -R appuser:appuser /usr/src/app

# Create data directory as root
RUN mkdir -p /usr/src/app/data && chown -R appuser:appuser /usr/src/app/data

# Switch to non-root user
USER appuser

# Expose the port your app runs on (if any)
# EXPOSE 3000

# Run the application
CMD ["bun", "start"]
