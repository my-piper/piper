-include ./config.env
export

export COMPOSE_PROJECT_NAME=piper
# export DOCKER_DEFAULT_PLATFORM=linux/amd64

COMPOSE_ARGS=-f tools/compose/compose.yaml

BACKEND=npm --prefix ./backend
FRONTEND=npm --prefix ./frontend

.PHONY: lint lint-backend lint-frontend lint-fix worktree worktree-setup worktree-prune

install:
	@set -e; \
	NVM_DIR="$${NVM_DIR:-$$HOME/.nvm}"; export NVM_DIR; \
	if [ ! -s "$$NVM_DIR/nvm.sh" ]; then \
		echo "nvm is required for make install: https://github.com/nvm-sh/nvm" >&2; \
		exit 1; \
	fi; \
	. "$$NVM_DIR/nvm.sh" --no-use; \
	nvm install; \
	git submodule init; \
	git submodule update; \
	git config core.hooksPath .githooks; \
	npm --prefix ./backend install; \
	npm --prefix ./frontend install

lint: lint-backend lint-frontend

check-node-version:
	./tools/check-node-version.sh

lint-backend:
	${BACKEND} run lint

lint-frontend:
	${FRONTEND} run lint

lint-fix:
	${BACKEND} run lint:fix
	${FRONTEND} run lint:fix

schemas:
	npm run --prefix ./backend cli schemas compile
	npm run --prefix ./frontend sync-schemas

test:
	${BACKEND} run test:typecheck
	${BACKEND} test
	$(MAKE) test-frontend

test-frontend:
	${FRONTEND} run test:typecheck
	${FRONTEND} run typecheck:templates
	${FRONTEND} run lint:tests
	${FRONTEND} test

test-frontend-browser:
	${FRONTEND} run test:browser

test-integration:
	${BACKEND} run test:integration

up:
	docker compose ${COMPOSE_ARGS} up --remove-orphans

# `up` plus a local Authentik for single sign-on (see tools/compose/authentik).
up-sso:
	docker compose ${COMPOSE_ARGS} --profile sso up --remove-orphans

down:
	docker compose ${COMPOSE_ARGS} --profile sso down

stop:
	docker compose ${COMPOSE_ARGS} --profile sso stop

# -- local development --
# Start the infra first with `make up` in another terminal.
# Each target runs in the foreground; Ctrl-C stops it.
# `dev` first stops any server, worker, periodic, sockets or frontend already running.
.PHONY: dev dev-stop run-backend run-server run-worker run-periodic run-sockets run-oauth run-registry run-frontend

dev: dev-stop
	$(MAKE) -j2 run-backend run-frontend

dev-stop:
	./tools/dev-stop.sh

run-backend:
	cd backend && npx --no-install run-p --print-label server worker periodic sockets registry

run-server:
	${BACKEND} run server

# Optional subset of workers (keys of the Workers map in backend/worker.ts):
#   make run-worker WORKERS="process_rapid_nodes process_regular_nodes"
run-worker:
	${BACKEND} run worker$(if $(WORKERS), -- -w $(WORKERS))

run-periodic:
	${BACKEND} run periodic

run-sockets:
	${BACKEND} run sockets

run-oauth:
	${BACKEND} run oauth

# Package Registry: serves uploaded node package code to Deno.
run-registry:
	${BACKEND} run registry

run-frontend:
	${FRONTEND} start

# -- clickhouse --
clickhouse-migrate-add:
	@read -p "enter migration name (e.g. add_new_column): " migration_name; \
	if [ -z "$$migration_name" ]; then \
		echo "Migration name is required!"; \
		exit 1; \
	fi; \
	npm run --prefix ./backend cli migrations clickhouse add $$migration_name

clickhouse-migrate:
	npm run --prefix ./backend cli migrations clickhouse apply

# -- mongo --
mongo-migrate-add:
	@read -p "enter migration name (e.g. add_new_column): " migration_name; \
	if [ -z "$$migration_name" ]; then \
		echo "Migration name is required!"; \
		exit 1; \
	fi; \
	npm run --prefix ./backend cli migrations mongo add $$migration_name

mongo-migrate:
	npm run --prefix ./backend cli migrations mongo apply

check-install-scripts:
	./tools/check-install-scripts.sh

check-lockfile:
	./tools/check-lockfile.sh

# One issue, one worktree (#287): make worktree ISSUE=<n> TYPE=<feat|fix|docs|chore> SLUG=<slug>
worktree:
	@test -n "$(ISSUE)" -a -n "$(TYPE)" -a -n "$(SLUG)" || { echo "usage: make worktree ISSUE=<n> TYPE=<feat|fix|docs|chore> SLUG=<slug>" >&2; exit 1; }
	./tools/worktree.sh new "$(TYPE)" "$(ISSUE)" "$(SLUG)"

# Submodule, Node from .nvmrc, npm ci and .worktreeinclude files in the current worktree
worktree-setup:
	./tools/worktree.sh setup .

# Remove clean worktrees whose PR is merged; DRY=1 only lists them
worktree-prune:
	./tools/worktree.sh prune $(if $(DRY),--dry-run,)
