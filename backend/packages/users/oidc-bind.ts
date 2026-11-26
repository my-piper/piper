import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { IdentityProvider, UserIdentity } from "models/user";
import { OidcClaims, OidcSignInError } from "./oidc-sign-in";

const DUPLICATE_KEY = 11000;

/**
 * Connects an OIDC identity to a signed-in user. The user proved owning both
 * accounts, so the emails don't have to match or be verified.
 */
export async function bindOidcIdentity(
  userId: string,
  { subject, email }: OidcClaims
): Promise<void> {
  if (!subject) {
    throw new OidcSignInError("sso_failed", "ID token lacks sub");
  }

  const provider = IdentityProvider.oidc;
  const owner = (await mongo.users.findOne(
    { identities: { $elemMatch: { provider, subject } } },
    { projection: { _id: 1 } }
  )) as { _id: string } | null;
  if (owner) {
    if (owner._id === userId) {
      return;
    }
    throw new OidcSignInError("sso_linked_elsewhere");
  }

  const identity = new UserIdentity({
    provider,
    subject,
    email,
    linkedAt: new Date(),
  });
  try {
    const { matchedCount } = await mongo.users.updateOne(
      { _id: userId, "identities.provider": { $ne: provider } },
      { $push: { identities: toPlain(identity) } } as object
    );
    if (!matchedCount) {
      throw new OidcSignInError("sso_already_connected");
    }
  } catch (err) {
    if (err?.code === DUPLICATE_KEY) {
      throw new OidcSignInError("sso_linked_elsewhere");
    }
    throw err;
  }
}
