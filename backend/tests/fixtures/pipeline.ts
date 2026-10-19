export function pipelineFixture() {
  return {
    name: "Contract pipeline",
    version: 1,
    start: { nodes: ["echo_node"] },
    inputs: {
      enabled: {
        type: "boolean",
        required: true,
        default: true,
        flows: { enabled_flow: { to: "echo_node", input: "enabled" } },
      },
      count: {
        type: "integer",
        default: 5,
        flows: { count_flow: { to: "echo_node", input: "count" } },
      },
      text: {
        type: "string",
        default: "default text",
        flows: { text_flow: { to: "echo_node", input: "text" } },
      },
    },
    outputs: {
      result: {
        type: "json",
        flows: { result_flow: { from: "echo_node", output: "result" } },
      },
    },
    flows: {},
    nodes: {
      echo_node: {
        _id: "echo_node",
        title: "Echo",
        arrange: { x: 0, y: 0 },
        execution: "rapid",
        script: "function costs({ inputs }) { return 1; }",
        inputs: {
          enabled: {
            type: "boolean",
            title: "Enabled",
            required: true,
            default: true,
          },
          count: { type: "integer", title: "Count", default: 5 },
          text: { type: "string", title: "Text", default: "default text" },
        },
        outputs: { result: { type: "json", title: "Result" } },
      },
    },
  };
}

export function launchRequestFixture() {
  return {
    inputs: { enabled: false, count: 0, text: "" },
    nodes: {
      echo_node: { inputs: { enabled: false, count: 0, text: "" } },
    },
  };
}
