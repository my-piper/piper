import { plainToInstance } from "class-transformer";
import { Node } from "src/models/node";

export default plainToInstance(Node, {
  _id: "multiply_numbers",
  title: "Multiply 2 numbers",
  description: "Pure Java Script runtime handler",
  type: "script",
  script: `(async () => {
  const { a, b } = inputs;
  return next({outputs: { c: a * b }});
})()`,
  arrange: {
    x: 200,
    y: 200,
  },
  inputs: {
    a: {
      title: "Number A",
      type: "integer",
      required: true,
    },
    b: {
      title: "Number B",
      type: "integer",
      required: true,
    },
  },
  outputs: {
    c: {
      title: "Result C",
      type: "integer",
    },
  },
});
