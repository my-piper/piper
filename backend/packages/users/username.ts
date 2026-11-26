import USER_SCHEMA from "schemas/user.json" with { type: "json" };
import { sid } from "utils/string";

const USERNAME = new RegExp(USER_SCHEMA.properties._id.pattern);
const MAX_LENGTH = 15;
const SUFFIX_LENGTH = 4;
const FALLBACK = "user";

export function toUsername(source: string | undefined): string | null {
  const username = (source ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "")
    .slice(0, MAX_LENGTH);

  return USERNAME.test(username) ? username : null;
}

export function usernameCandidates(
  { preferred, email }: { preferred?: string; email: string },
  attempts = 5
): string[] {
  const [local] = email.split("@");
  const base = toUsername(preferred) ?? toUsername(local) ?? FALLBACK;
  const stem = base.slice(0, MAX_LENGTH - SUFFIX_LENGTH);

  const suffixed = Array.from(
    { length: attempts },
    () => `${stem}${sid(SUFFIX_LENGTH)}`
  );
  return [base, ...suffixed];
}
