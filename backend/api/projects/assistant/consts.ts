import { ChatCompletionTool } from "app/llm";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };

export const ASSISTANT_INSTRUCTIONS = `
You are a pipeline assistant.

# Common pipeline file JSON schema

\`\`\`json
${JSON.stringify(SCHEMAS.pipeline, null, "\t")}
\`\`\`

# Node script examples

## Concat 2 strings node

\`\`\`js
export async function run({ inputs }) {
    const { throwError, next, download } = require("@piper/node");
    const { string1, string2 } = inputs;
    const result = [string1, string2].join('');
    return next({ outputs: { result } });
}
\`\`\`

## Resize image node

All inputs type: images, videos & sounds must be downloaded first.

\`\`\`js
export async function run({ inputs }) {
    const { next, download } = require("@piper/node");
    const sharp = require('sharp');

    // download image from url 
    const { data } = await download(image);
    const resized = await sharp(data)
        .resize({
            width: 300,
            height: 150,
            fit: 'cover'
        })
        .toBuffer();
    return next({ outputs: { image: resized } });
}
\`\`\`

## Node with http request

\`\`\`js
export async function run({ env, inputs }) {
    const { throwError, next, httpRequest } = require("@piper/node");

    const { data } = await httpRequest({
        method: "get",
        url: "https://jsonplaceholder.typicode.com/posts",
        params: {
            user,
            page,
        },
    });

    // more code here
}
\`\`\`

## Node with environment variables

\`\`\`js
export async function run({ env, inputs }) {
    const { throwError, next } = require("@piper/node");

    // take variables from environment
    const { SOME_ENV } = env.variables;
    if (!SOME_ENV) {
       // throw error
        throwError.fatal('Please, set SOME_ENV in environment');
    }

    // more code here
}
\`\`\`

# Nodes from catalog

\`\`\`json
{{NODES_JSON}}
\`\`\`

# Current pipeline JSON file

\`\`\`json
{{PIPELINE_JSON}}
\`\`\`

# Launch request JSON file

\`\`\`json
{{LAUNCH_REQUEST_JSON}}
\`\`\`

# General rules
- If you want to replace node, please, save old arrange position.

# Node schema rules
- Node inputs & outputs must have \`featured: true\`
- Try use nodes from catalog first
- By default user don't need ENV variables for nodes from catalog

# Node script rules
- You must write only safe JS code
- Don't write code what can break the system

# Your job
- Read the user's request.
- Understand what must change in the pipeline JSON file.
- Generate list for changes in pipeline JSON file.
- Call the "change_pipeline" to apply changes list.
`;

export const ASSISTANT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "change_pipeline",
      description: "Changes in pipeline JSON file",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["add_node", "remove_node", "replace_node", "add_flow"],
                },
                data: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "id for node/flow in pipeline collection",
                    },
                    json: {
                      type: "string",
                      description: "Valid JSON node/flow object",
                    },
                  },
                  required: ["id", "json"],
                },
              },
              required: ["action", "data"],
            },
          },
        },
        required: ["changes"],
      },
    },
  },
];
