FROM oven/bun:latest AS bun

# Build stage
FROM bun AS builder
LABEL author="Siyavash Habashi (ghashange) / Ronald Dehuysser (Bringme)"

ENV DOCKER_BUILD="true"

# the directory for your app within the docker image
# NOTE: if you need to change this, change the $CERT_WEBROOT_PATH env
WORKDIR /app

######################################################################################
# Add your own Dockerfile entries here
######################################################################################
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
FROM debian:stable-slim

COPY --from=oven/bun:latest /usr/local/bin/bun /usr/local/bin/bun

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]

WORKDIR /usr/src/server
# Install only production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
# Copy the UI build output
COPY --from=builder /app/dist ./dist
# The bun runtime executes the TypeScript server sources directly
COPY src/server ./src/server

# port 80 is mandatory for webroot challenge
# port 443 is mandatory for https
# port 3000 default port for UI and server in development mode
EXPOSE 80
EXPOSE 443
EXPOSE 3000

# Set all environment variables
ENV DOCKER_BUILD="false"
ENV NODE_ENV=production
ENV API_KEY=sendgrid-api-key

# the command which starts your express server.
CMD ["bun", "run", "./src/server/Server.ts"]
