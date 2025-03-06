import { JSONSchema7 } from "json-schema";

export interface CustomJSONSchema7 extends JSONSchema7 {
  propertyOrder?: number;
  format?: string;
}
