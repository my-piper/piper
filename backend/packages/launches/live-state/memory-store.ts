import { Command, LiveStore } from "./store";

type Value = string | string[] | Set<string> | Map<string, string>;
type Entry = { value: Value; expiresAt: number | null };

/**
 * An in-memory LiveStore for unit tests. It keeps Redis's semantics for the
 * commands the live state uses, including expiry by `Date.now()` (so fake
 * timers move it), and runs each batch synchronously, which makes it atomic.
 */
export class MemoryStore implements LiveStore {
  private entries = new Map<string, Entry>();

  async exec(commands: Command[]): Promise<unknown[]> {
    return commands.map((command) => this.apply(command));
  }

  /** Forgets everything, for a fresh test. */
  clear() {
    this.entries.clear();
  }

  /** Seconds the key has left: -1 without expiry, -2 when absent (as TTL). */
  ttl(key: string): number {
    const entry = this.read(key);
    if (!entry) {
      return -2;
    }
    return entry.expiresAt === null
      ? -1
      : Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  /** The keys that exist now, for tests that check nothing leaks. */
  keys(): string[] {
    return [...this.entries.keys()].filter((key) => this.read(key));
  }

  private read(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (entry?.expiresAt !== null && entry?.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry ?? null;
  }

  private collection<T extends Value>(key: string, create: () => T): T {
    const entry = this.read(key);
    if (entry) {
      return entry.value as T;
    }
    const value = create();
    this.entries.set(key, { value, expiresAt: null });
    return value;
  }

  private list(key: string): string[] {
    return (this.read(key)?.value as string[]) ?? [];
  }

  private hash(key: string): Map<string, string> {
    return this.collection(key, () => new Map<string, string>());
  }

  private apply(command: Command): unknown {
    const { key } = command;
    switch (command.op) {
      case "get":
        return (this.read(key)?.value as string) ?? null;
      case "set": {
        const current = this.read(key);
        if (command.nx && current) {
          return null;
        }
        const expiresAt = command.ttl
          ? Date.now() + command.ttl * 1000
          : command.keepTtl
            ? (current?.expiresAt ?? null)
            : null;
        this.entries.set(key, { value: command.value, expiresAt });
        return "OK";
      }
      case "del":
        return this.read(key) && this.entries.delete(key) ? 1 : 0;
      case "exists":
        return this.read(key) ? 1 : 0;
      case "expire": {
        const entry = this.read(key);
        if (!entry) {
          return 0;
        }
        entry.expiresAt = Date.now() + command.ttl * 1000;
        return 1;
      }
      case "sAdd": {
        const set = this.collection(key, () => new Set<string>());
        const added = !set.has(command.member);
        set.add(command.member);
        return added ? 1 : 0;
      }
      case "sIsMember":
        return ((this.read(key)?.value as Set<string>) ?? new Set()).has(
          command.member
        );
      case "sMembers":
        return [...((this.read(key)?.value as Set<string>) ?? [])];
      case "rPush": {
        const list = this.collection<string[]>(key, () => []);
        list.push(...command.values);
        return list.length;
      }
      case "lPush": {
        const list = this.collection<string[]>(key, () => []);
        for (const value of command.values) {
          list.unshift(value);
        }
        return list.length;
      }
      case "lRange":
        return slice(this.list(key), command.start, command.stop);
      case "lTrim": {
        const kept = slice(this.list(key), command.start, command.stop);
        if (kept.length === 0) {
          this.entries.delete(key);
        } else {
          this.read(key).value = kept;
        }
        return "OK";
      }
      case "lRem": {
        const list = this.list(key);
        const kept = list.filter((value) => value !== command.value);
        if (kept.length === 0) {
          this.entries.delete(key);
        } else if (kept.length !== list.length) {
          this.read(key).value = kept;
        }
        return list.length - kept.length;
      }
      case "incrBy": {
        const entry = this.read(key);
        const value = Number(entry?.value ?? 0) + command.by;
        this.entries.set(key, {
          value: String(value),
          expiresAt: entry?.expiresAt ?? null,
        });
        return value;
      }
      case "hSetNX": {
        const hash = this.hash(key);
        if (hash.has(command.field)) {
          return 0;
        }
        hash.set(command.field, command.value);
        return 1;
      }
      case "hIncrBy": {
        const hash = this.hash(key);
        const value = Number(hash.get(command.field) ?? 0) + command.by;
        hash.set(command.field, String(value));
        return value;
      }
      case "hSet": {
        const hash = this.hash(key);
        for (const [field, value] of Object.entries(command.fields)) {
          hash.set(field, value);
        }
        return Object.keys(command.fields).length;
      }
      case "hGetAll":
        return Object.fromEntries(
          (this.read(key)?.value as Map<string, string>) ?? []
        );
    }
  }
}

// LRANGE/LTRIM indexes: inclusive, negative ones count from the end
function slice(list: string[], start: number, stop: number): string[] {
  const from = start < 0 ? Math.max(list.length + start, 0) : start;
  const to = stop < 0 ? list.length + stop : Math.min(stop, list.length - 1);
  return from > to ? [] : list.slice(from, to + 1);
}
