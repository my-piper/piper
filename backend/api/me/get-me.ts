import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { User } from "models/user";
import { checkLogged, handle } from "utils/http";
import { Me } from "./models/me";

api.get(
  "/api/me",
  handle(({ currentUser }) => async () => {
    checkLogged(currentUser);

    const { password, identities } = toInstance(
      (await mongo.users.findOne(
        { _id: currentUser._id },
        { projection: { password: 1, identities: 1 } }
      )) ?? {},
      User
    );
    return toPlain(
      new Me({
        _id: currentUser._id,
        email: currentUser.email,
        roles: currentUser.roles,
        createdAt: currentUser.createdAt,
        identities,
        hasPassword: !!password,
      })
    );
  })
);
