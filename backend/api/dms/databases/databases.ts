import { toInstance, toPlain } from "core-kit/utils/models";
import { Request } from "express";
import "reflect-metadata";
import { api } from "../../../app/api";
import nocodb from "../../../app/nocodb";
import { handle } from "../../../utils/http";
import { DatabaseList } from "./models/database";

api.get(
  "/api/dms/databases",
  handle(() => async (req: Request) => {
    const { data } = await nocodb.get("meta/workspaces/wdd0aiuk/bases");
    const { list } = toInstance(data as Object, DatabaseList);
    return toPlain(list);
  })
);
