import api from "app/api";
import mongo from "app/mongo";
import { mapTo, toPlain, validate } from "core-kit/packages/transform";
import { Project, ProjectComment } from "models/project";
import { User } from "models/user";
import { ulid } from "ulid";
import { checkLogged, checkProjectAccess, handle, toModel } from "utils/http";

api.post(
  "/api/projects/:project/comments",
  handle(({ currentUser }) => async ({ params: { project }, body }) => {
    checkLogged(currentUser);

    checkProjectAccess(
      currentUser,
      toModel(
        await mongo.projects.findOne(
          { _id: project },
          { projection: { createdBy: 1 } }
        ),
        Project
      )
    );

    const request = mapTo(body, ProjectComment);
    await validate(request);

    const { message } = request;

    const comment = mapTo(
      {
        _id: ulid(),
        createdAt: new Date(),
        createdBy: (() => {
          const { _id } = currentUser;
          return new User({ _id });
        })(),
        project,
        message,
      },
      ProjectComment
    );
    const plain = toPlain(comment);
    await mongo.projectComments.insertOne(plain as { _id: string });
    return plain;
  })
);
