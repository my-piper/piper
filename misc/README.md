# Find key without TTL

```bash
chmod +x no-ttl-keys.sh
./no-ttl-keys.sh --host 127.0.0.1 --port 6379 --db 0 --output no-ttl-keys.csv
```

# Remove keys without TTL

```bash
chmod +x remove-no-ttl-scan.sh
DB=0 PATTERN='launch:*' COUNT=20000 BATCH=10000 ./remove-no-ttl-scan.sh
```
