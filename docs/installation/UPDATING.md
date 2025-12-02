# Update Sora AI to the latest version

To update Sora AI to the latest release, follow the steps below.

## For Docker users (Using pre-built images)

Simply pull the latest image and restart your container:

```bash
docker pull rgpartners/soraai:latest
docker stop soraai
docker rm soraai
docker run -d -p 3000:3000 -v soraai-uploads:/home/soraai/uploads --name soraai rgpartners/soraai:latest
```

For slim version:

```bash
docker pull rgpartners/soraai:slim-latest
docker stop soraai
docker rm soraai
docker run -d -p 3000:3000 -e SEARXNG_API_URL=https://your-searxng-url -v soraai-uploads:/home/soraai/uploads --name soraai rgpartners/soraai:slim-latest
```

Once updated, go to http://localhost:3000 and verify the latest changes. Your settings are preserved automatically.

## For Docker users (Building from source)

1. Navigate to your Sora AI directory and pull the latest changes:

   ```bash
   cd soraai-chat
   git pull origin main
   ```

2. Rebuild the Docker image:

   ```bash
   docker build -t soraai .
   ```

3. Stop and remove the old container, then start the new one:

   ```bash
   docker stop soraai
   docker rm soraai
   docker run -p 3000:3000 -p 8080:8080 --name soraai soraai
   ```

4. Once the command completes, go to http://localhost:3000 and verify the latest changes.

## For non-Docker users

1. Navigate to your Sora AI directory and pull the latest changes:

   ```bash
   cd soraai-chat
   git pull origin main
   ```

2. Install any new dependencies:

   ```bash
   pnpm install
   ```

3. Ensure your `.env` includes `POSTGRES_URL` (or `POSTGRESQL_URL`) pointing to your Neon/Postgres instance, then run database migrations:

   ```bash
   pnpm db:migrate
   ```

4. Rebuild the application:

   ```bash
   pnpm build
   ```

5. Restart the application:

   ```bash
   pnpm start
   ```

6. Go to http://localhost:3000 and verify the latest changes. Your settings are preserved automatically.

---
