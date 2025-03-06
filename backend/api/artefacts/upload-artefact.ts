import { toInstance, validate } from "core-kit/utils/models";
import { Request, Response } from "express";
import multer, { memoryStorage } from "multer";
import "reflect-metadata";
import sharp from "sharp";
import { api } from "../../app/api";
import * as storage from "../../app/storage";
import { DataError } from "../../types/errors";
import { handle } from "../../utils/http";
import { sid } from "../../utils/string";
import { extFromMime } from "../../utils/web";
import { UploadArtefactRequest } from "./model/upload-artefact-request";

api.post(
  "/api/artefacts",
  handle(() => async (req: Request, res: Response) => {
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

    let { mimetype: mimeType, buffer } = file;

    const ext = extFromMime(mimeType);

    const request = toInstance(req.body, UploadArtefactRequest);
    await validate(request);

    const { grayscale } = request;
    if (grayscale) {
      buffer = await sharp(buffer)
        .greyscale()
        .bandbool(sharp.bool.and)
        .png()
        .toBuffer();
    }

    const fileName = [sid(), ext].join(".");
    const url = await storage.artefact(buffer, fileName);

    return {
      url,
    };
  })
);
