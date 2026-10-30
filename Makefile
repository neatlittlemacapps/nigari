.PHONY: all frontend backend build clean

all: build

# The version this build says it is, the same for the frontend and the server:
# when they differ, every page load shows "a new version is available" that a
# reload never clears. A build of a released commit is that release (v1.6.9);
# one after it says so (v1.6.9-2-gabc1234, which the update check treats as
# unreleased); without git, the default in server/backup.go. Before this, a
# local build was "dev" in the browser and "1.6.8" on the server (#265).
VERSION ?= $(shell git describe --tags --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || sed -n 's/^var Version = "\(.*\)"$$/v\1/p' server/backup.go)

frontend:
	cd web && (npm ci || npm install) && NIGARI_VERSION=$(VERSION) npm run build

backend:
	go mod tidy
	# -trimpath: without it the builder's absolute paths (including their
	# username) end up inside the binary — needlessly disclosed, and it breaks
	# reproducible builds.
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X nigari/server.Version=$(VERSION)" -o nigari .

build: frontend backend

clean:
	rm -rf web/dist web/node_modules nigari
