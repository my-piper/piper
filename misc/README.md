# Remove keys without TTL

```bash
chmod +x remove-no-ttl-scan.sh
DB=0 PATTERN='launch:*' COUNT=20000 BATCH=10000 ./remove-no-ttl-scan.sh
```
