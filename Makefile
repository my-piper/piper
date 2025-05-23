-include ./config.env
export

export COMPOSE_PROJECT_NAME=piper
# export DOCKER_DEFAULT_PLATFORM=linux/amd64

COMPOSE_ARGS=-f tools/compose/compose.yaml

BACKEND=npm --prefix ./backend
FRONTEND=npm --prefix ./frontend

install:
	git submodule init
	git submodule update
	npm --prefix ./backend install
	npm --prefix ./frontend install
	npm --prefix ./translator install

schemas:
	npm run --prefix ./backend cli schemas compile
	npm run --prefix ./frontend sync-schemas

up:
	docker compose ${COMPOSE_ARGS} up --remove-orphans

down:
	docker compose ${COMPOSE_ARGS} down

stop:
	docker compose ${COMPOSE_ARGS} stop

# -- clickhouse --
clickhouse-migration-add:
	@read -p "enter migration name (e.g. add_new_column): " migration_name; \
	if [ -z "$$migration_name" ]; then \
		echo "Migration name is required!"; \
		exit 1; \
	fi; \
	npm run --prefix ./backend cli migrations clickhouse add $$migration_name 
 
clickhouse-migrate:
	npm run --prefix ./backend cli migrations clickhouse apply

# -- mongo --
mongo-migration-add:
	@read -p "enter migration name (e.g. add_new_column): " migration_name; \
	if [ -z "$$migration_name" ]; then \
		echo "Migration name is required!"; \
		exit 1; \
	fi; \
	npm run --prefix ./backend cli migrations mongo add $$migration_name 
 
mongo-migrate:
	npm run --prefix ./backend cli migrations mongo apply
