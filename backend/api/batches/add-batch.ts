import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { Batch } from "../../models/batch";
import { User } from "../../models/user";
import { checkLogged, handle } from "../../utils/http";
import { sid } from "../../utils/string";
import { AddBatchRequest } from "./models/add-batch-request";

api.post(
  "/api/batches",
  handle(({ currentUser }) => async (req) => {
    checkLogged(currentUser);

    const request = toInstance(req.body as Object, AddBatchRequest);
    await validate(request);

    const { title } = request;

    const batch = new Batch({
      _id: sid(),
      createdAt: new Date(),
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      title,
    });

    const plain = toPlain(batch);
    await mongo.batches.insertOne(plain as { _id: string });

    return plain;
  })
);
