import axios from "axios";
import { createLogger } from "core-kit/packages/logger";
import { mapTo, toInstance, toPlain } from "core-kit/packages/transform";
import { ExecuteRequest, ExecutionError, ExecutionResult } from "./classes";
import { DENO_URL } from "./costs";

const logger = createLogger("deno");

export async function execute(
  script: string,
  fn: string,
  payload: object,
  {
    timeout,
    isolation,
  }: {
    timeout?: number;
    isolation?: "none" | "process";
  } = {}
): Promise<ExecutionResult> {
  logger.debug("Running script");
  const request = mapTo(
    { script, fn, payload, timeout, isolation },
    ExecuteRequest
  );
  try {
    const { data } = await axios.post(DENO_URL, toPlain(request));
    logger.debug("Take results");
    return toInstance(data, ExecutionResult);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      switch (err.response?.status) {
        case 400:
          throw new Error(err.response.data.error);
        case 422:
          const e = toInstance(err.response.data, ExecutionError);
          Object.setPrototypeOf(e, ExecutionError.prototype);
          throw e;
      }
    }
    throw err;
  }
}
