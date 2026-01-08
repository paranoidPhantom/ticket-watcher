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

# Build the application
# (Note: This project doesn't have a build step, but keeping the stage for consistency)
RUN bun run --production --silent

# Final stage
FROM base
WORKDIR /usr/src/app

# Install chromium for puppeteer
# RUN apk add --no-cache \
#     chromium \
#     nss \
#     freetype \
#     harfbuzz \
#     ca-certificates \
#     ttf-freefont \
#     font-noto-emoji

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create a non-root user to run the app
# RUN addgroup -g 1001 -S bun && \
#     adduser -u 1001 -S bun -G bun

# Copy built application
COPY --from=build /usr/src/app .

# Switch to non-root user
USER bun

# Expose the port your app runs on (if any)
# EXPOSE 3000

# Run the application
CMD ["bun", "start"]
