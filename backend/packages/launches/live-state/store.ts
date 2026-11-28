/**
 * The storage port of the Launch live state: the few Redis commands it uses,
 * as data. An adapter runs a batch of them in order and atomically, so a
 * transition that writes several keys is seen whole or not at all.
 */
export type Command =
  | { op: "get"; key: string }
  | {
      op: "set";
      key: string;
      value: string;
      // seconds; without it (and without keepTtl) the key never expires
      ttl?: number;
      keepTtl?: boolean;
      // only when the key is absent; the reply is then null instead of "OK"
      nx?: boolean;
    }
  | { op: "del"; key: string }
  | { op: "exists"; key: string }
  | { op: "expire"; key: string; ttl: number }
  | { op: "sAdd"; key: string; member: string }
  | { op: "sIsMember"; key: string; member: string }
  | { op: "sMembers"; key: string }
  | { op: "rPush"; key: string; values: string[] }
  | { op: "lPush"; key: string; values: string[] }
  | { op: "lRange"; key: string; start: number; stop: number }
  | { op: "lTrim"; key: string; start: number; stop: number }
  | { op: "lRem"; key: string; value: string }
  | { op: "incrBy"; key: string; by: number }
  | { op: "hSetNX"; key: string; field: string; value: string }
  | { op: "hIncrBy"; key: string; field: string; by: number }
  | { op: "hSet"; key: string; fields: Record<string, string> }
  | { op: "hGetAll"; key: string };

/**
 * Replies follow Redis: get gives a string or null, exists and the list and
 * counter commands a number, sIsMember a boolean, sMembers and lRange string
 * arrays, hGetAll a record (empty when the key is absent), set "OK" or null.
 */
export interface LiveStore {
  exec(commands: Command[]): Promise<unknown[]>;
}
