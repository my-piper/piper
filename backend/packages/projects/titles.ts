import mongo from "app/mongo";
import escapeRegExp from "lodash/escapeRegExp";
import { DataError } from "core-kit/types/errors";
import { MongoServerError } from "mongodb";
import { ConflictError } from "types/errors";

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 160;

/**
 * A title as saved: without outer spaces, 5 to 160 characters long. The
 * pipeline name's own rule counts the spaces, so a rename or an import
 * checks the trimmed title here.
 */
export function cleanTitle(name: string) {
  const title = name.trim();
  const { length } = [...title];
  if (length < TITLE_MIN_LENGTH || length > TITLE_MAX_LENGTH) {
    throw new DataError(
      `Project title must have ${TITLE_MIN_LENGTH} to ${TITLE_MAX_LENGTH} characters`
    );
  }
  return title;
}

/**
 * Compares titles ignoring case; the unique index `title_unique`
 * (migrations/mongo) is built with the same collation.
 */
export const TITLE_COLLATION = { locale: "en", strength: 2 };

export const TITLE_TAKEN = "A project with this title already exists";

/** Whether another Project than `except` already has the title. */
export async function isTitleTaken(title: string, except?: string) {
  const found = await mongo.projects
    .find(
      { title, ...(except !== undefined ? { _id: { $ne: except } } : {}) },
      { collation: TITLE_COLLATION, projection: { _id: 1 } }
    )
    .limit(1)
    .toArray();
  return found.length > 0;
}

export async function checkTitleFree(title: string, except?: string) {
  if (await isTitleTaken(title, except)) {
    throw new ConflictError(TITLE_TAKEN);
  }
}

/** `title (n)`, the base cut so the whole stays within the length limit. */
export function numberedTitle(title: string, n: number) {
  const suffix = ` (${n})`;
  const chars = [...title];
  const base =
    chars.length + suffix.length > TITLE_MAX_LENGTH
      ? chars.slice(0, TITLE_MAX_LENGTH - suffix.length).join("")
      : title;
  return base + suffix;
}

/**
 * The title itself when no Project has it, otherwise the first free
 * `title (n)` from 2 on; used where the user can't choose the title (imports).
 */
export async function freeTitle(title: string) {
  // short enough to match the cut bases of numbered titles too
  const prefix = escapeRegExp([...title].slice(0, 100).join(""));
  const similar = await mongo.projects
    .find<{
      title: string;
    }>(
      { title: { $regex: new RegExp(`^${prefix}`, "i") } },
      { projection: { title: 1 } }
    )
    .toArray();
  const taken = new Set(similar.map(({ title }) => title.toLowerCase()));

  if (!taken.has(title.toLowerCase())) {
    return title;
  }
  for (let n = 2; ; n++) {
    const numbered = numberedTitle(title, n);
    if (!taken.has(numbered.toLowerCase())) {
      return numbered;
    }
  }
}

/** Turns the unique index's duplicate-key error into a 409. */
export function titleConflict(e: unknown) {
  return e instanceof MongoServerError &&
    e.code === 11000 &&
    "title" in (e.keyPattern ?? {})
    ? new ConflictError(TITLE_TAKEN)
    : e;
}
