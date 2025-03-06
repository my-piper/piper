Piper - visual pipelines builder fo AI.

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

Add admin user

```bash
npm --prefix backend run cli add-user -- --id admin --name admin --role admin --password xyzXYZ
```

# Debug

## Read Kafka stream

```bash
kafka-console-consumer --bootstrap-server localhost:9094 --topic pipeline.messages --from-beginning
```
