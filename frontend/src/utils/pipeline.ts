import * as marked from "marked";
import { Pipeline } from "src/models/pipeline";

export type PipelineEnvironment = {
  type: string;
  title: string;
  properties: {
    variables: {
      type: string;
      title: string;
      properties: {
        [key: string]: {
          type: string;
          title: string;
          description: string;
          options: {
            inputAttributes: {
              placeholder: string;
            };
          };
        };
      };
      required: string[];
      additionalProperties: boolean;
    };
  };
  required: string[];
  additionalProperties: boolean;
};

export function getPipelineEnvironment(pipeline: Pipeline) {
  const schema: PipelineEnvironment = {
    type: "object",
    title: $localize`:@@label.environment:Environment`,
    properties: {
      variables: {
        type: "object",
        title: $localize`:@@label.variables:Variables`,
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    required: ["variables"],
    additionalProperties: false,
  };

  const { variables } = schema.properties;
  for (const [, node] of pipeline.nodes) {
    if (!!node.environment) {
      for (const [key, { title, type, description }] of node.environment) {
        variables.properties[key] = {
          title,
          type,
          description: !!description
            ? (marked.parse(description) as string)
            : null,
          options: {
            inputAttributes: {
              placeholder: $localize`:@@message.leave_empty_to_global_scope:Leave empty to use our value`,
            },
          },
        };
        variables.required.push(key);
      }
    }
  }

  return schema;
}
