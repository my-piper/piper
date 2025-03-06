import { HttpsAgent } from "agentkeepalive";
import axios from "axios";
import { plainToInstance } from "class-transformer";
import fs from "fs";
import { NODE_ENV, PAAS_AUTH, PAAS_BASE_URL } from "../consts/core";
import { createLogger } from "../logger";
import { DataError, FatalError, UnknownError } from "../types/errors";

const logger = createLogger("paas");

function getUrl(path: string) {
  return `${PAAS_BASE_URL}/${path}`;
}

const [username, password] = PAAS_AUTH.split("|");

const httpsAgent = new HttpsAgent({
  keepAliveMsecs: 15000,
  maxSockets: 150,
  maxFreeSockets: 10,
  timeout: 10000,
  freeSocketTimeout: 30000,
});
const httpClient = axios.create({ httpsAgent });

export async function createTask(request: Object): Promise<string> {
  if (NODE_ENV === "test") {
    fs.writeFileSync("../tmp/paas.json", JSON.stringify(request, null, "\t"));
  }

  try {
    const response = await httpClient({
      method: "post",
      url: getUrl("tasks"),
      headers: {
        "Content-type": "application/json",
      },
      auth: { username, password },
      data: JSON.stringify(request),
    });
    const { id } = response.data;
    return id;
  } catch (e) {
    const { errors } = e.response?.data;
    if (errors?.length > 0) {
      throw new DataError(errors.join(", "));
    }
    logger.error(e);
    throw new UnknownError(e.statusText);
  }
}

export async function cancelTask(id: string): Promise<void> {
  logger.debug(`Cancel task ${id}`);
  try {
    await httpClient({
      method: "post",
      url: getUrl(`tasks/${id}/cancel`),
      headers: {
        "Content-type": "application/json",
      },
      auth: { username, password },
    });
    logger.debug(`Cancel task ${id}`);
  } catch (e) {
    const { errors } = e.response?.data;
    if (errors?.length > 0) {
      logger.error(errors.join(", "));
      //throw new DataError(errors.join(", "));
    }
    //throw new UnknownError(e.statusText);
  }
}

export async function checkTask(id: string): Promise<any> {
  const response = await httpClient({
    method: "get",
    url: getUrl(`tasks/${id}`),
    headers: {
      "Content-type": "application/json",
    },
    auth: { username, password },
  });
  return response.data;
}

export async function checkState<T>(
  id: string,
  model: new () => T
): Promise<T | null> {
  const { data } = await httpClient({
    method: "get",
    url: getUrl(`tasks/${id}`),
    headers: {
      "Content-type": "application/json",
    },
    auth: { username, password },
  });

  const { status, results } = data;
  switch (status) {
    case "preparing":
    case "scheduling":
    case "scheduled":
    case "pending":
    case "processing":
      return null;
    case "completed":
      const { data } = results;
      return plainToInstance(model, data);
    case "failed":
      const { error } = results;
      throw new FatalError(error);
    default:
      throw new FatalError("Wrong task status");
  }
}
