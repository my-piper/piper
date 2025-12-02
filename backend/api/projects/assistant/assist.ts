import ajv from "app/ajv";
import api from "app/api";
import llm, { ChatCompletionMessage } from "app/llm";
import mongo from "app/mongo";
import { LLM_MODEL } from "consts/llm";
import {
  mapTo,
  toInstance,
  toModel,
  toPlain,
} from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { Node } from "models/node";
import { Project } from "models/project";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { checkAdmin, checkLogged, handle } from "utils/http";
import { sid } from "utils/string";
import { ChatMessage, PipelineChanges } from "../models/assistant-answer";
import { ASSISTANT_INSTRUCTIONS, ASSISTANT_TOOLS } from "./consts";

api.post(
  "/api/projects/:_id/assist",
  handle(({ currentUser }) => async ({ params: { _id }, body: question }) => {
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

    prompt = prompt.replace(
      "{{LAUNCH_REQUEST_JSON}}",
      JSON.stringify(toPlain(project.launchRequest), null, "\t")
    );

    const nodes = await mongo.nodes.find().toArray();
    prompt = prompt.replace(
      "{{NODES_JSON}}",
      nodes.map((n) => JSON.stringify(toPlain(n), null, "\t")).join("\n\n")
    );

    const history = await mongo.chatMessages
      .find({ project: project._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const latest = history.reverse().reduce((arr, m) => {
      const { completions } = toInstance(m, ChatMessage);
      return arr.concat(completions);
    }, []);

    const initial = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: prompt },
        ...latest,
        { role: "user", content: question },
      ],
      tools: ASSISTANT_TOOLS,
    });

    const {
      choices: [{ message }],
    } = initial;

    await mongo.chatMessages.insertOne(
      toPlain(
        mapTo(
          {
            _id: sid(),
            project: project._id,
            createdAt: new Date(),
            from: currentUser._id,
            message: question,
            raw: {
              role: "user",
              content: question,
            },
          },
          ChatMessage
        )
      ) as { _id: string }
    );

    const { content, tool_calls: calls } = message;

    const answer = toInstance(
      {
        _id: sid(),
        project: project._id,
        createdAt: new Date(),
        from: "assistant",
      },
      ChatMessage
    );

    const completions: ChatCompletionMessage[] = [message];

    if (calls?.length > 0) {
      const [call] = calls;
      if (call.type === "function") {
        const { arguments: args } = call.function;
        try {
          const { changes } = toInstance(JSON.parse(args), PipelineChanges);

          for (const { action, data } of changes) {
            switch (action) {
              case "add_node":
              case "replace_node": {
                console.log(data.json);
                const node = toInstance(data.json, Node);
                const validate = ajv.compile(SCHEMAS.node);
                if (!validate(node)) {
                  const { errors } = validate;
                  throw new DataError(
                    `Node schema invalid: ${JSON.stringify(errors)}`
                  );
                }
                break;
              }

              case "remove_node":
                break;
              case "add_flow": {
                const flow = toInstance(data.json, Node);
                const validate = ajv.compile(SCHEMAS.node);
                if (!validate(flow)) {
                  const { errors } = validate;
                  throw new DataError(
                    `Flow schema invalid: ${JSON.stringify(errors)}`
                  );
                }
                break;
              }
            }
          }

          assign(answer, { changes });
          completions.push({
            role: "tool",
            tool_call_id: call.id,
            content: `{"ok": true}`,
          });
        } catch (e) {
          console.error(e);
          assign(answer, { message: "Something went wrong" });
          completions.push({
            role: "tool",
            tool_call_id: call.id,
            content: e.message,
          });
        }
      }
    } else {
      assign(answer, { message: content });
    }

    assign(answer, { completions });
    await mongo.chatMessages.insertOne(toPlain(answer) as { _id: string });

    return toPlain(answer);
  })
);
