# List available development commands.
default:
    @just --list

# Install the exact locked development dependencies without lifecycle scripts.
install:
    npm ci --ignore-scripts --no-audit --no-fund

# Check source lint rules and import ordering without editing files.
lint:
    ./node_modules/.bin/biome check --formatter-enabled=false .

# Format source and configuration files, and organize imports.
fmt:
    ./node_modules/.bin/biome check --write --linter-enabled=false .

# Check formatting without editing files.
fmt-check:
    ./node_modules/.bin/biome format .

# Type-check the UI, model, and tests without generating JavaScript.
typecheck:
    ./node_modules/.bin/tsc --project tsconfig.json

# Run isolated model tests; does not contact GitHub.
test:
    node --test model.test.ts

# Re-run tests as the model or tests change.
test-watch:
    node --test --watch model.test.ts

# Run the complete local quality gate without editing files.
check: fmt-check lint typecheck test
