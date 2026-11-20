import api from "app/api";
import { DataError } from "core-kit/types/errors";
import { Request, Response } from "express";
import multer, { memoryStorage, MulterError } from "multer";
import { publishArchive } from "packages/node-packages/publish-archive";
import { checkAdmin, handle } from "utils/http";

const MAX_ARCHIVE_MB = 20;
const MAX_ARCHIVE_BYTES = MAX_ARCHIVE_MB * 1024 * 1024;

api.post(
  "/api/node-packages/actions/upload-archive",
  handle(({ currentUser }) => async (req: Request, res: Response) => {
    checkAdmin(currentUser);

    const upload = multer({
      storage: memoryStorage(),
      limits: { fileSize: MAX_ARCHIVE_BYTES, files: 1 },
    }).single("file");
    await new Promise<void>((done, reject) =>
      upload(req, res, (error: unknown) => {
        if (!error) {
          done();
        } else if ((error as MulterError).code === "LIMIT_FILE_SIZE") {
          reject(new DataError(`Archive is larger than ${MAX_ARCHIVE_MB} MB`));
        } else {
          reject(new DataError("Can't upload package archive"));
        }
      })
    );

    if (!req.file) {
      throw new DataError("Attach a package archive as file");
    }

    return publishArchive(req.file.buffer);
  })
);
