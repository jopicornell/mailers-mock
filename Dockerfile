FROM node:24-alpine AS node

# Build stage
FROM node AS builder
LABEL author="Siyavash Habashi (ghashange) / Ronald Dehuysser (Bringme)"

ENV DOCKER_BUILD="true"

# the directory for your app within the docker image
# NOTE: if you need to change this, change the $CERT_WEBROOT_PATH env
WORKDIR /app

# RUN apk add --no-cache python3 make g++

######################################################################################
# Add your own Dockerfile entries here
######################################################################################
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


FROM node

RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /usr/src/server
# Copy package.json and package-lock.json
COPY package*.json ./
# Install only production dependencies
RUN npm i --production
# Copy transpiled js from builder stage into the final image
COPY --from=builder /app/dist ./dist
# Copy src/server into final image
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
CMD ["npm", "run", "start"]
