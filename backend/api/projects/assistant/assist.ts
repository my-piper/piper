import api from "app/api";
import llm from "app/llm";
import mongo from "app/mongo";
import { LLM_MODEL } from "consts/llm";
import { toInstance, toModel, toPlain } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Project } from "models/project";
import { checkAdmin, checkLogged, handle } from "utils/http";
import { ChatMessage } from "../models/assistant-answer";
import { ASSISTANT_INSTRUCTIONS, ASSISTANT_TOOLS } from "./consts";

api.post(
  "/api/projects/:_id/assist",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            _id: 1,
            title: 1,
            pipeline: 1,
          },
        }
      ),
      Project
    );

    if (project.createdBy?._id !== currentUser._id) {
      checkAdmin(currentUser);
    }

    let prompt = ASSISTANT_INSTRUCTIONS.replace(
      "{{PIPELINE_JSON}}",
      JSON.stringify(toPlain(project.pipeline), null, "\t")
    );

    const nodes = await mongo.nodes.find().toArray();
    prompt = prompt.replace(
      "{NODES_JSON}",
      nodes.map((n) => JSON.stringify(toPlain(n), null, "\t")).join("\n\n")
    );

    const initial = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: body },
      ],
      tools: ASSISTANT_TOOLS,
    });

    const {
      choices: [{ message }],
    } = initial;

    const { content, tool_calls: calls } = message;

    const answer = toInstance(
      { from: "assistant", message: content },
      ChatMessage
    );

    if (calls?.length > 0) {
      const [call] = calls;
      if (call.type === "function") {
        const { changes } = toInstance(
          JSON.parse(call.function.arguments),
          ChatMessage
        );
        assign(answer, { changes });
      }
    }

    return toPlain(answer);
  })
);
