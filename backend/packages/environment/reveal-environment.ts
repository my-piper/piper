import { Environment } from "models/environment";

/**
 * Removes each Secret Variable of a decrypted Environment that has just been
 * made visible (in `visible` but not in `previouslyVisible`) without a new
 * value (not in `changed`), so a stored secret is never revealed and the name
 * falls back to the next Environment again. Only string Variables stay in
 * `visible`: any other name, or one without a Variable, starts secret when a
 * string Variable is set under it later.
 */
export function dropRevealedSecrets(
  environment: Environment,
  previouslyVisible: string[] | undefined,
  changed: Set<string>
) {
  const { variables } = environment;
  const before = new Set(previouslyVisible ?? []);
  for (const name of environment.visible ?? []) {
    if (
      !before.has(name) &&
      !changed.has(name) &&
      typeof variables.get(name) === "string"
    ) {
      variables.delete(name);
    }
  }
  environment.visible = environment.visible?.filter(
    (name) => typeof variables.get(name) === "string"
  );
}
