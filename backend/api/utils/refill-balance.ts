import api from "app/api";
import mongo from "app/mongo";
import { MASTER_KEY } from "consts/core";
import { toInstance, validate } from "core-kit/packages/transform";
import { PenTestingError } from "core-kit/types/errors";
import { User } from "models/user";
import { refillBalance } from "packages/users/refill-balance";
import { handle, toModel } from "utils/http";
import { BillingOrder } from "./models/billing-order";

/* 
{
  "article": {
    "product": {
      "amount": 10
    }
  },
  "user": {
    "email": "admin@example.com"
  }
}

*/

api.post(
  "/api/utils/refill-balance",
  handle(() => async ({ query: { t: key }, body }) => {
    if (key !== MASTER_KEY) {
      throw new PenTestingError();
    }

    const request = toInstance(body, BillingOrder);
    await validate(request);

    const {
      article: {
        product: { amount },
      },
      user: { email },
      url,
    } = request;

    const user = toModel(
      await mongo.users.findOne({ email }, { projection: { _id: 1 } }),
      User
    );

    await refillBalance(user._id, amount, { url });
    return null;
  })
);
