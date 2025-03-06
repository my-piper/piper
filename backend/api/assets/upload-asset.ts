import { toPlain } from "core-kit/utils/models";
import { Request, Response } from "express";
import multer, { memoryStorage } from "multer";
import "reflect-metadata";
import { ulid } from "ulid";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import * as storage from "../../app/storage";
import { Asset } from "../../models/assets";
import { User } from "../../models/user";
import { DataError } from "../../types/errors";
import { checkLogged, handle } from "../../utils/http";
import { getMetadata } from "../../utils/metadata";
import { sid } from "../../utils/string";

api.post(
  "/api/assets",
  handle(({ currentUser }) => async (req: Request, res: Response) => {
    checkLogged(currentUser);

    const m = multer({ storage: memoryStorage() });
    const upload = m.single("file");

    type File = { mimetype: string; size: number; buffer: Buffer };

    const file = await new Promise<File>((done, reject) => {
      upload(req, res, (error) => {
        if (!!error) {
          reject(new DataError("Can't upload file"));
        }
        done(req["file"]);
      });
    });
    if (!file) {
      throw new DataError("Can't upload file");
    }

    const { mimetype: mimeType, buffer } = file;

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
        const { _id, name } = currentUser;
        return new User({ _id, name });
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
