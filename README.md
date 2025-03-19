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
./worker.sh
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

# How to

## Get environment

```bash
npm --prefix backend run cli environment
```

## Set variable

```bash
npm --prefix backend run cli set-variable -- --name XXX --value xyzXYZ
```

## Remove variable

```bash
npm --prefix backend run cli remove-variable -- --name XXX
```

# Modules

## List

```bash
npm run cli modules
```

## Install package

```bash
npm run cli modules add @fal-ai/client ^1.2.3
```

## Remove package

```bash
npm run cli modules remove @fal-ai/client
```

## Update

```bash
npm run cli modules update
```

## Rebooting workers

```bash
npm run cli workers reboot
```

# Debug

## Read Kafka stream

```bash
kafka-console-consumer --bootstrap-server localhost:9094 --topic pipeline.messages --from-beginning
```
