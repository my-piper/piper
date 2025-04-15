import api from "app/api";
import mongo from "app/mongo";
import * as storage from "app/storage";
import { toInstance, toPlain, validate } from "core-kit/utils/models";
import { Request } from "express";
import "reflect-metadata";
import { ulid } from "ulid";
import { checkLogged, handle } from "utils/http";
import { Asset } from "../../models/assets";
import { User } from "../../models/user";
import { getMetadata } from "../../utils/metadata";
import { sid } from "../../utils/string";
import { download } from "../../utils/web";
import { ImportAsset } from "./models/import-asset";

api.post(
  "/api/assets/import",
  handle(({ currentUser }) => async ({ body }: Request) => {
    checkLogged(currentUser);

    const request = toInstance(body as Object, ImportAsset);
    await validate(request);

    const { url } = request;

    const { mimeType, data: buffer } = await download(url);

    const { type, format, width, height, data } = await getMetadata(
      mimeType,
      buffer
    );

    const _id = sid();
    const fileName = [_id, format].join(".");

    const now = new Date();
    const asset = new Asset({
      _id,
      createdAt: now,
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      type,
      format,
      width,
      height,
      url: await storage.asset(data, fileName),
      cursor: ulid(),
    });
    const plain = toPlain(asset);
    await mongo.assets.insertOne(asset as { _id: string });
    return plain;
  })
);
