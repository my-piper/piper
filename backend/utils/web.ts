import { HttpsAgent } from "agentkeepalive";
import axios from "axios";
import { createLogger } from "core-kit/packages/logger";

const CONTENT_TYPE_HEADER = "content-type";

const logger = createLogger("utils/web");

const httpsAgent = new HttpsAgent({
  keepAliveMsecs: 5000,
  maxSockets: 150,
  maxFreeSockets: 10,
  timeout: 20000,
  freeSocketTimeout: 30000,
});
const httpClient = axios.create({ httpsAgent });

export async function download(
  url: string
): Promise<{ mimeType: string; data: Buffer }> {
  logger.debug(`Downloading url from ${url}`);
  const { data, headers } = await httpClient({
    method: "get",
    url,
    responseType: "arraybuffer",
  });

  let mimeType = headers[CONTENT_TYPE_HEADER];
  // TODO: temporary
  if (mimeType === "application/octet-stream") {
    mimeType = "video/mp4";
  }

  return { mimeType, data: data as Buffer };
}

export async function downloadBinary(url: string): Promise<Buffer> {
  const { data } = await download(url);
  return data;
}

export function extFromMime(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "application/octet-stream":
    case "video/mp4":
      return "mp4";
    default:
      throw new Error(`Can't find type ${type}`);
  }
}
