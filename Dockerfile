# --- Frontend build (its output is the same for every target arch) ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
ARG VERSION=dev
WORKDIR /src/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
# `npm run build` runs the whole gate first, and the gate reads files all over
# the repository, not only web/: the wiki against the MCP catalogue and the
# route table (wiki/, server/), the capability manifest, every plan against the
# surfaces registry (.specify/, specs/), and the release checks (install.sh,
# the workflows, the Makefile, this file, the docs). Copying them one by one
# broke the image twice: each new check read a directory that was not here
# (v1.6.9's image died on .specify/memory/surfaces.md). So the whole context
# comes in, and .dockerignore keeps out what must not (node_modules, .git,
# the built frontend). The gate is deliberately not skippable.
#
# The cost is honest and worth naming: any change busts this layer's cache and
# the frontend rebuilds, about thirty seconds on a build that runs once per
# release.
COPY . /src
# Same VERSION the backend is stamped with, so the two never disagree and the
# "reload" banner only fires after an actual deploy.
RUN SALT_VERSION=${VERSION} npm run build

# --- Backend build (cross-compiled to the requested target arch) ---
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
COPY --from=web /src/web/dist ./web/dist
# CGO off + pure-Go SQLite ⇒ a fully static binary, and building on the native
# builder while targeting $TARGETARCH avoids slow QEMU emulation of the compiler.
RUN go mod tidy && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w -X nigari/server.Version=${VERSION}" -o /salt .

# --- Runtime ---
FROM alpine:3.20
RUN adduser -D -H salt && mkdir -p /data && chown salt /data
USER salt
ENV SALT_ADDR=:8420 SALT_DATA=/data
VOLUME /data
EXPOSE 8420
COPY --from=build /salt /usr/local/bin/salt
ENTRYPOINT ["salt"]
