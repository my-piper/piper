import api from "app/api";
import mongo from "app/mongo";
import { HIDDEN_STRING } from "consts/core";
import { toPlain } from "core-kit/utils/models";
import { Primitive } from "types/primitive";
import { checkLogged, handle, toModel } from "utils/http";
import { Project } from "../../models/project";

api.get(
  "/api/projects/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne({
        $or: [{ _id }, { slug: _id }],
      }),
      Project
    );

    const { environment } = project;
    if (!!environment) {
      const { variables } = environment;
      for (const [k, v] of variables || new Map<string, Primitive>()) {
        switch (typeof v) {
          case "string":
            variables.set(k, HIDDEN_STRING);
            break;
        }
      }
    }

    return toPlain(project);
  })
);
