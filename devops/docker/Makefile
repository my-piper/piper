.PHONY: server
server:
	npm run server

.PHONY: worker
process_rapid_nodes:
	./worker.sh -i -w process_rapid_nodes -h

.PHONY: worker
process_regular_nodes:
	./worker.sh -i -w process_regular_nodes -h

.PHONY: worker
process_deferred_nodes:
	./worker.sh -i -w process_deferred_nodes -h

.PHONY: worker
process_protracted_nodes:
	./worker.sh -i -w process_protracted_nodes -h

.PHONY: worker
run_launches:
	./worker.sh -w run_launches -h

.PHONY: worker
set_launches_io:
	./worker.sh -w set_launches_io -h

.PHONY: worker
set_launches_errors:
	./worker.sh -w set_launches_errors -h

.PHONY: worker
update_users_balance:
	./worker.sh -w update_users_balance -h

.PHONY: worker
record_pipelines_usage:
	./worker.sh -w record_pipelines_usage -h

.PHONY: worker
update_packages:
	./worker.sh -w update_packages -h

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