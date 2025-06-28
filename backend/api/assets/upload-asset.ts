import api from "app/api";
import mongo from "app/mongo";
import * as storage from "app/storage";
import { validate } from "class-validator";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Request, Response } from "express";
import { Asset } from "models/asset";
import { User } from "models/user";
import multer, { memoryStorage } from "multer";
import "reflect-metadata";
import { ulid } from "ulid";
import { checkLogged, handle, isAdmin } from "utils/http";
import { getMetadata } from "utils/metadata";
import { sid } from "utils/string";
import { UploadAsset } from "./models/upload-asset";

api.post(
  "/api/assets",
  handle(({ currentUser }) => async (req: Request, res: Response) => {
    checkLogged(currentUser);

    const m = multer({ storage: memoryStorage() });
    const upload = m.single("file");

    type File = { mimetype: string; size: number; buffer: Buffer };

    await new Promise<void>((done, reject) => {
      upload(req, res, (error) => {
        if (!!error) {
          reject(new DataError("Can't upload file"));
        }
        done();
      });
    });
    const { body, file } = req;

    const request = toInstance(body, UploadAsset);
    await validate(request);

    const { folder } = request;

    if (!file) {
      throw new DataError("Can't upload file");
    }

    const { mimetype: mimeType, buffer } = file;

    const { type, format, width, height, data } = await getMetadata(
      mimeType,
      buffer
    );

    const _id = sid();
    const fileName = [
      ...(!!folder ? [folder] : []),
      isAdmin(currentUser)
        ? file.originalname || [_id, format].join(".")
        : [_id, format].join("."),
    ].join("_");

    const now = new Date();
    const asset = new Asset({
      _id,
      createdAt: now,
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      folder,
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
