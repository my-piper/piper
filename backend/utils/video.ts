import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";
import { createLogger } from "../logger";
import { DataError } from "../types/errors";

const logger = createLogger("utils/video");

type Size = { width: number; height: number };

export async function getSize(buffer: Buffer): Promise<Size> {
  const input = new PassThrough();
  input.end(buffer);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(input)
      .ffprobe((err: Error | null, metadata) => {
        if (!!err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(
          (stream) => stream.codec_type === "video"
        );
        if (!!videoStream) {
          const { width, height } = videoStream;
          resolve({ width, height });
        } else {
          reject(new DataError("No video stream found in the file"));
        }
      });
  });
}

export async function getPoster(
  video: string,
  format: string = "mjpeg"
): Promise<Buffer> {
  const output = new PassThrough();
  const buffers = [];

  return new Promise((resolve, reject) => {
    output.on("data", (chunk) => buffers.push(chunk));
    output.on("end", () => resolve(Buffer.concat(buffers)));
    output.on("error", (err) => reject(err));

    ffmpeg()
      .input(video)
      .frames(1)
      .format(format)
      .on("start", (cmd) => logger.info(cmd))
      .on("error", (err, stdout, stderr) => {
        logger.error(stdout);
        logger.error(stderr);
        reject(new Error(err.message));
      })
      .pipe(output, { end: true });
  });
}
