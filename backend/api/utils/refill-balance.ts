import api from "app/api";
import mongo from "app/mongo";
import { plainToInstance } from "class-transformer";
import { PenTestingError } from "core-kit/types/errors";
import { validate } from "core-kit/utils/models";
import { handle, toModel } from "utils/http";
import { MASTER_KEY } from "../../consts/core";
import { refillBalance } from "../../logic/users/refill-balance";
import { User } from "../../models/user";
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

    const request = plainToInstance(BillingOrder, body);
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
