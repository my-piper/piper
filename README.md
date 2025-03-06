Piper - visual pipelines builder for AI.

# Development

Pull latest sub-modules

```bash
git submodule update --init --recursive
```

Run services

```bash
make up
```

Copy `~/backend/.env.template` to `~/backend/.env`

```bash
cp ~/backend/.env.template ~/backend/.env
```

Compile schemas

```bash
make schemas
```

Run backend

```bash
cd backend
npm run sockets
npm run server
npm run worker
```

Run frontend

```bash
cd frontend
npm start
```

Open `http://localhost/`

Add admin user

```bash
npm --prefix backend run cli add-user -- --id admin --email admin@yourdomain.com --role admin --password xyzXYZ
```

# Debug

## Read Kafka stream

```bash
kafka-console-consumer --bootstrap-server localhost:9094 --topic pipeline.messages --from-beginning
```
