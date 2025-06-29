import { DataError } from "core-kit/types/errors";
import sharp from "sharp";
import { fit } from "utils/image";
import { getSize } from "utils/video";

export async function getMetadata(
  mimeType: string,
  buffer: Buffer
): Promise<{
  type: string;
  format: string;
  data: Buffer;
  width?: number;
  height?: number;
}> {
  const [type, format] = mimeType.split("/");
  switch (mimeType) {
    case "image/png":
    case "image/jpeg":
    case "image/webp": {
      const fitted = await fit(sharp(buffer), {
        maxWidth: 2028,
        maxHeight: 2028,
      });
      const { width, height } = await fitted.metadata();
      return {
        type,
        format,
        width,
        height,
        data: await fitted.toBuffer(),
      };
    }
    case "audio/mp3": {
      return { type: "audio", format: "mp3", data: buffer };
    }
    case "audio/aac": {
      return { type: "audio", format: "aac", data: buffer };
    }
    case "application/zip": {
      return { type: "archive", format: "zip", data: buffer };
    }
    case "video/mp4": {
      const { width, height } = await getSize(buffer);
      return { type, format, width, height, data: buffer };
    }
    default:
      throw new DataError(`Incorrect file format ${mimeType}`);
  }
}
