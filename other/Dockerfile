# This file is moved to the root directory before building the image

# base node image
FROM node:20-bookworm-slim as base

# set for base and all layer that inherit from it
ENV NODE_ENV production

# Install openssl for Prisma and build tools for native modules
RUN apt-get update && apt-get install -y fuse3 openssl sqlite3 ca-certificates procps rsync build-essential python3

RUN apt-get install -y chromium

# Install all node_modules, including dev dependencies
FROM base as deps

WORKDIR /myapp

ADD package.json pnpm-lock.yaml ./
RUN npx pnpm install --prod false

# Setup production node_modules
FROM base as production-deps

WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules
ADD package.json pnpm-lock.yaml ./
RUN npx pnpm prune --prod
# Rebuild better-sqlite3 for the Linux environment
RUN cd node_modules/better-sqlite3 && npx node-gyp rebuild
RUN npx puppeteer browsers install chrome

# Build the app
FROM base as build

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

WORKDIR /myapp


COPY --from=deps /myapp/node_modules /myapp/node_modules


# prisma files will be generated in the production image, see below

ADD . .

# Mount the secret and set it as an environment variable and run the build
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    export SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN) && \
    npx pnpm run build

# Finally, build the production image with minimal footprint
FROM base

ENV FLY="true"
ENV LITEFS_DIR="/litefs/data"
ENV DATABASE_FILENAME="sqlite.db"
ENV DATABASE_PATH="$LITEFS_DIR/$DATABASE_FILENAME"
ENV DATABASE_URL="file:$DATABASE_PATH"
ENV CACHE_DATABASE_FILENAME="cache.db"
ENV CACHE_DATABASE_PATH="$LITEFS_DIR/$CACHE_DATABASE_FILENAME"
ENV INTERNAL_PORT="8080"
ENV PORT="8081"
ENV NODE_ENV="production"
# For WAL support: https://github.com/prisma/prisma-engines/issues/4675#issuecomment-1914383246
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1"

# add shortcut for connecting to database CLI
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$DATABASE_URL" > /usr/local/bin/database-cli && chmod +x /usr/local/bin/database-cli

WORKDIR /myapp

COPY --from=production-deps /myapp/node_modules /myapp/node_modules
COPY --from=production-deps /root/.cache/puppeteer/chrome /root/.cache/puppeteer/chrome

COPY --from=build /myapp/server-build /myapp/server-build
COPY --from=build /myapp/build /myapp/build
COPY --from=build /myapp/package.json /myapp/package.json
COPY --from=build /myapp/prisma /myapp/prisma
COPY --from=build /myapp/app/components/ui/icons /myapp/app/components/ui/icons

# Generate prisma files here as they end up in the wrong directory when we generate them in the build step using pnpm
RUN npx prisma generate

# prepare for litefs
COPY --from=flyio/litefs:0.5.11 /usr/local/bin/litefs /usr/local/bin/litefs
ADD other/litefs.yml /etc/litefs.yml
RUN mkdir -p /data ${LITEFS_DIR}

ADD . .

CMD ["litefs", "mount"]