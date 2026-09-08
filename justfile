# Dzine Canvas development commands.
# Run `just` to list the available recipes.

default:
    @just --list

# Show available project commands.
help:
    @just --list

# Install the pinned toolchain and locked npm dependencies.
setup:
    mise install
    npm ci

# Install locked npm dependencies without changing package-lock.json.
install:
    npm ci

# Start the template API and web application together.
dev:
    npm run dev:all

# Start only the web application.
dev-web:
    npm run dev

# Start only the template API.
dev-api:
    npm run api

# Build the production web bundle.
build:
    npm run build

# Check TypeScript without emitting files.
typecheck:
    npx tsc --noEmit

# Run the repository's required local checks.
check: typecheck build

# Regenerate the checked-in starter templates. Review the resulting diff.
seed-templates:
    npm run seed:templates
