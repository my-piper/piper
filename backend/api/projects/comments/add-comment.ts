import api from "app/api";
import mongo from "app/mongo";
import { NotFoundError } from "core-kit/types/errors";
import { mapTo, toPlain, validate } from "core-kit/utils/models";
import { ProjectComment } from "models/project";
import { User } from "models/user";
import { ulid } from "ulid";
import { checkLogged, handle } from "utils/http";

api.post(
  "/api/projects/:project/comments",
  handle(({ currentUser }) => async ({ params: { project }, body }) => {
    checkLogged(currentUser);

    if ((await mongo.projects.countDocuments({ _id: project })) <= 0) {
      throw new NotFoundError();
    }

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
