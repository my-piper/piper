.PHONY: server
server:
	npm run server

.PHONY: worker
process_rapid_nodes:
	npm run worker -w process_rapid_nodes -h

.PHONY: worker
process_regular_nodes:
	npm run worker -w process_regular_nodes -h

.PHONY: worker
process_deferred_nodes:
	npm run worker -w process_deferred_nodes -h

.PHONY: worker
process_protracted_nodes:
	npm run worker -w process_protracted_nodes -h

.PHONY: worker
run_launches:
	npm run worker -w run_launches -h

.PHONY: worker
set_launches_io:
	npm run worker -w set_launches_io -h

.PHONY: worker
set_launches_errors:
	npm run worker -w set_launches_errors -h

.PHONY: worker
update_users_balance:
	npm run worker -w update_users_balance -h

.PHONY: worker
record_pipelines_usage:
	npm run worker -w record_pipelines_usage -h

.PHONY: worker
update_packages:
	npm run worker -w update_packages -h

.PHONY: chrome
chrome:
	npm run chrome & socat TCP-LISTEN:9322,fork TCP:0.0.0.0:9222

.PHONY: periodic
periodic:
	npm run periodic

.PHONY: oauth
oauth:
	npm run oauth

.PHONY: metrics
metrics:
	npm run metrics

.PHONY: sockets 
sockets:
	npm run sockets

.PHONY: clickhouse-migrate 
clickhouse-migrate:
	npm run cli migrations clickhouse apply

.PHONY: mongo-migrate 
mongo-migrate:
	npm run cli migrations mongo apply