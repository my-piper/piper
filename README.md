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
npm run cli modules add @anthropic-ai/sdk 0.37.0
npm run cli modules add @fal-ai/client 1.2.3
npm run cli modules add @gradio/client 1.12.0
npm run cli modules add @runware/sdk-js 1.1.37
npm run cli modules add artworks github:My-Piper/Packages-ArtWorks
npm run cli modules add file-type 20.4.0
npm run cli modules add fluent-ffmpeg 2.1.3
npm run cli modules add openai 4.85.4
npm run cli modules add sharp 0.33.5
npm run cli modules add together-ai 0.13.0
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
