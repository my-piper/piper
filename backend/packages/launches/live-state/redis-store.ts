import redis from "core-kit/packages/redis/redis";
import { Command, LiveStore } from "./store";

// The client and a MULTI chain take the same commands; only what this adapter
// calls is listed.
type Target = {
  get(key: string): unknown;
  set(key: string, value: string, options?: object): unknown;
  del(key: string): unknown;
  exists(key: string): unknown;
  expire(key: string, ttl: number): unknown;
  sAdd(key: string, member: string): unknown;
  sIsMember(key: string, member: string): unknown;
  sMembers(key: string): unknown;
  rPush(key: string, values: string[]): unknown;
  lPush(key: string, values: string[]): unknown;
  lRange(key: string, start: number, stop: number): unknown;
  lTrim(key: string, start: number, stop: number): unknown;
  lRem(key: string, count: number, value: string): unknown;
  incrBy(key: string, by: number): unknown;
  hSetNX(key: string, field: string, value: string): unknown;
  hIncrBy(key: string, field: string, by: number): unknown;
  hSet(key: string, fields: Record<string, string>): unknown;
  hGetAll(key: string): unknown;
};

function apply(target: Target, command: Command): unknown {
  switch (command.op) {
    case "get":
      return target.get(command.key);
    case "set": {
      const { key, value, ttl, keepTtl, nx } = command;
      return target.set(key, value, {
        ...(ttl ? { EX: ttl } : {}),
        ...(keepTtl ? { KEEPTTL: true } : {}),
        ...(nx ? { NX: true } : {}),
      });
    }
    case "del":
      return target.del(command.key);
    case "exists":
      return target.exists(command.key);
    case "expire":
      return target.expire(command.key, command.ttl);
    case "sAdd":
      return target.sAdd(command.key, command.member);
    case "sIsMember":
      return target.sIsMember(command.key, command.member);
    case "sMembers":
      return target.sMembers(command.key);
    case "rPush":
      return target.rPush(command.key, command.values);
    case "lPush":
      return target.lPush(command.key, command.values);
    case "lRange":
      return target.lRange(command.key, command.start, command.stop);
    case "lTrim":
      return target.lTrim(command.key, command.start, command.stop);
    case "lRem":
      return target.lRem(command.key, 0, command.value);
    case "incrBy":
      return target.incrBy(command.key, command.by);
    case "hSetNX":
      return target.hSetNX(command.key, command.field, command.value);
    case "hIncrBy":
      return target.hIncrBy(command.key, command.field, command.by);
    case "hSet":
      return target.hSet(command.key, command.fields);
    case "hGetAll":
      return target.hGetAll(command.key);
  }
}

/** Runs one command directly and a batch as one MULTI transaction. */
export const redisStore: LiveStore = {
  async exec(commands) {
    if (commands.length === 1) {
      return [await apply(redis as unknown as Target, commands[0])];
    }
    const multi = redis.multi();
    for (const command of commands) {
      apply(multi as unknown as Target, command);
    }
    return (await multi.exec()) as unknown[];
  },
};
