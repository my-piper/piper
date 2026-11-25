import api from "app/api";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { Environment } from "models/environment";
import { VariableRename } from "models/variable-rename";
import { checkAdmin, handle } from "utils/http";

api.post(
  "/api/environment/:key/rename",
  handle(({ currentUser }) => async ({ params: { key }, body }) => {
    checkAdmin(currentUser);

    const rename = toInstance(body, VariableRename);
    await validate(rename);
    const { name } = rename;

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
    if (!json) {
      throw new NotFoundError();
    }

    const environment = toInstance(JSON.parse(json), Environment);
    const { variables } = environment;
    if (!variables.has(key)) {
      throw new NotFoundError();
    }
    if (variables.has(name)) {
      throw new DataError(`Variable ${name} already exists`);
    }
    variables.set(name, variables.get(key));
    variables.delete(key);
    environment.visible = environment.visible?.map((visible) =>
      visible === key ? name : visible
    );
    await redis.set(
      GLOBAL_ENVIRONMENT_KEY,
      JSON.stringify(toPlain(environment))
    );

    return null;
  })
);
