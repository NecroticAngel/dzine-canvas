# Dzine Canvas development commands.
# Run `just` to list the available recipes.

set dotenv-load := false
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

# Show available project commands.
help:
    @just --list

# Install the pinned toolchain and locked npm dependencies.
setup:
    mise install
    just doctor
    just install

# Install locked npm dependencies without changing package-lock.json.
install:
    mise exec -- npm ci

# Print the pinned development tool versions.
doctor:
    mise exec -- node --version
    mise exec -- npm --version
    mise exec -- just --version

# Start the template API and web application together.
dev:
    mise exec -- npm run dev:all

# Start only the web application.
dev-web:
    mise exec -- npm run dev

# Start only the template API.
dev-api:
    mise exec -- npm run api

# Build the production web bundle.
build:
    mise exec -- npm run build

# Check TypeScript without emitting files.
typecheck:
    mise exec -- npx tsc --noEmit

# Run the repository's required local checks.
check: typecheck build

# Regenerate the checked-in starter templates. Review the resulting diff.
seed-templates:
    mise exec -- npm run seed:templates
