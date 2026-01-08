# Docker Deployment for Ticket Watcher Bot

This project is containerized using Docker for easy deployment.

## Prerequisites

- Docker and Docker Compose installed
- Telegram Bot Token from [@BotFather](https://t.me/botfather)
- Your Telegram User ID (for admin access)

## Quick Start

1. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   ```env
   BOT_TOKEN=your_telegram_bot_token_here
   BOT_ADMIN_ID=your_telegram_user_id_here
   ```

3. **Build and run with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

4. **View logs:**
   ```bash
   docker-compose logs -f
   ```

## Docker Configuration

### Dockerfile Features
- **Multi-stage build** for smaller image size
- **Alpine-based** Bun image (oven/bun:1.3.5-alpine)
- **Chromium installed** for Puppeteer headless browser
- **Non-root user** (bun) for security
- **Persistent volume** for SQLite database

### Environment Variables

Set these in your `.env` file or Docker Compose environment:

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram Bot API token | ✅ Yes |
| `BOT_ADMIN_ID` | Telegram user ID for admin commands | ✅ Yes |
| `NODE_ENV` | Node environment (default: production) | ❌ No |
| `DATA_DIR` | Directory for SQLite database (default: /usr/src/app/data) | ❌ No |

### Persistent Storage

The SQLite database is stored in a Docker volume named `ticket-data`. This ensures:
- **Data persistence** across container restarts
- **Easy backups** - volume can be backed up independently
- **Database survives** container recreation

### Using Secrets (Production)

For production deployments, use Docker secrets instead of environment variables:

1. Create secrets directory:
   ```bash
   mkdir -p secrets
   echo "your_bot_token" > secrets/bot_token.txt
   echo "123456789" > secrets/admin_id.txt
   ```

2. Uncomment secrets section in `docker-compose.yml`

3. Update environment variables to use secrets:
   ```yaml
   environment:
     - BOT_TOKEN=/run/secrets/bot_token
     - BOT_ADMIN_ID=/run/secrets/admin_id
   ```

## Manual Docker Commands

### Build Image
```bash
docker build -t ticket-watcher .
```

### Run Container
```bash
docker run -d \
  --name ticket-watcher \
  --restart unless-stopped \
  -e BOT_TOKEN=your_token \
  -e BOT_ADMIN_ID=your_id \
  -v ticket-data:/usr/src/app/data \
  ticket-watcher
```

### Check Container Status
```bash
docker ps
docker logs ticket-watcher
```

### Stop and Remove
```bash
docker-compose down  # Using compose
docker stop ticket-watcher && docker rm ticket-watcher  # Manual
```

## Development with Docker

For development with auto-restart:

1. **Override command in docker-compose:**
   ```yaml
   command: bun run dev
   ```

2. **Mount local source code:**
   ```yaml
   volumes:
     - ./:/usr/src/app
     - /usr/src/app/node_modules
   ```

## Troubleshooting

### Puppeteer Issues in Docker
If Puppeteer crashes in Docker:

1. **Check Chrome installation:**
   ```bash
   docker exec ticket-watcher which chromium-browser
   ```

2. **Increase memory limits** if running out of memory

3. **Add more Chrome flags** in Dockerfile if needed:
   ```dockerfile
   ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"
   ```

### Database Issues

1. **Check volume permissions:**
   ```bash
   docker exec ticket-watcher ls -la /usr/src/app/data
   ```

2. **Backup database:**
   ```bash
   docker cp ticket-watcher:/usr/src/app/data/bot_users.sqlite ./backup.sqlite
   ```

## Production Considerations

1. **Use reverse proxy** (nginx, Caddy) if exposing webhooks
2. **Monitor resources** - Telegram bot + Puppeteer can be memory-intensive
3. **Regular backups** of the Docker volume
4. **Set up logging** to external service (ELK, Loki)
5. **Health checks** - implement endpoint for monitoring

## Security Notes

- The container runs as non-root user (`bun`)
- Database is isolated in separate volume
- Consider using Docker secrets for sensitive data
- Regular security updates for base images

## Support

For issues with Docker deployment:
1. Check logs: `docker-compose logs -f`
2. Verify environment variables
3. Ensure Chrome is properly installed in container
