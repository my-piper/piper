import { Authorization } from "api/users/models/authorization";
import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { IdentityProvider, User, UserIdentity } from "models/user";
import { ulid } from "ulid";
import { getToken } from "./auth";
import { usernameCandidates } from "./username";

export type OidcSignInErrorCode = "sso_account_exists" | "sso_failed";

export class OidcSignInError extends Error {
  constructor(
    readonly code: OidcSignInErrorCode,
    message: string = code
  ) {
    super(message);
  }
}

export type OidcClaims = {
  subject: string;
  email?: string;
  preferredUsername?: string;
};

const DUPLICATE_KEY = 11000;

function authorize(user: User): Authorization {
  const plain = new User({ _id: user._id, email: user.email });
  return new Authorization({ token: getToken(plain), user: plain });
}

export async function signInWithOidc({
  subject,
  email,
  preferredUsername,
}: OidcClaims): Promise<Authorization> {
  if (!subject || !email) {
    throw new OidcSignInError("sso_failed", "ID token lacks sub or email");
  }

  const provider = IdentityProvider.oidc;
  const linked = (await mongo.users.findOne(
    { identities: { $elemMatch: { provider, subject } } },
    { projection: { _id: 1, email: 1 } }
  )) as User | null;
  if (linked) {
    await mongo.users.updateOne(
      { _id: linked._id },
      { $set: { "identities.$[identity].email": email } },
      {
        arrayFilters: [
          { "identity.provider": provider, "identity.subject": subject },
        ],
      }
    );
    return authorize(linked);
  }

  const owner = await mongo.users.findOne(
    { email },
    { projection: { _id: 1 } }
  );
  if (owner) {
    throw new OidcSignInError("sso_account_exists");
  }

  const now = new Date();
  for (const _id of usernameCandidates({
    preferred: preferredUsername,
    email,
  })) {
    const user = new User({
      _id,
      email,
      createdAt: now,
      cursor: ulid(),
      identities: [
        new UserIdentity({ provider, subject, email, linkedAt: now }),
      ],
    });
    try {
      await mongo.users.insertOne(toPlain(user) as { _id: string });
      return authorize(user);
    } catch (err) {
      if (err?.code !== DUPLICATE_KEY) {
        throw err;
      }
      if (err.keyPattern?.email) {
        throw new OidcSignInError("sso_account_exists");
      }
      if (!err.keyPattern?._id) {
        throw new OidcSignInError("sso_failed", "Identity is already linked");
      }
    }
  }

  throw new OidcSignInError("sso_failed", "No free username");
}
