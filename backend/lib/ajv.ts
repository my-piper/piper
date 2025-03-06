import Ajv from "ajv";
const ajv = new Ajv({ strict: false });
ajv.addFormat("number", (data) => typeof data === "number");
ajv.addFormat("url", (data) => /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(data));
ajv.addFormat("textarea", (data) => typeof data === "string");

ajv.addKeyword({
  type: "object",
  keyword: "dateObject",
  validate: (schema: boolean, data: any): boolean => {
    if (schema !== true) {
      return true;
    }
    return data instanceof Date && !isNaN(data.getTime());
  },
  errors: false,
});

export default ajv;
