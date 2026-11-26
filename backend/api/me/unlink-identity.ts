import api from "app/api";
import mongo from "app/mongo";
import { toInstance } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { IdentityProvider, User } from "models/user";
import { checkLogged, handle } from "utils/http";

api.delete(
  "/api/me/identities/:provider",
  handle(({ currentUser }) => async ({ params: { provider } }) => {
    checkLogged(currentUser);

    const { _id } = currentUser;
    const { password, identities = [] } = toInstance(
      await mongo.users.findOne(
        { _id },
        { projection: { password: 1, identities: 1 } }
      ),
      User
    );
    if (!identities.some((identity) => identity.provider === provider)) {
      throw new NotFoundError("No such connected account");
    }

    const remaining = identities.filter(
      (identity) => identity.provider !== provider
    );
    if (!password && !remaining.length) {
      throw new DataError(
        "Set a password before disconnecting your only way to sign in"
      );
    }

    await mongo.users.updateOne({ _id }, {
      $pull: { identities: { provider: provider as IdentityProvider } },
    } as object);
    return null;
  })
);
