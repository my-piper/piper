import { instanceToPlain, plainToInstance } from "class-transformer";
import { validate as classValidator, ValidationError } from "class-validator";
import { DataError, NotFoundError } from "core-kit/types/errors";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";

export async function validate(obj: Object) {
  const errors = await classValidator(obj);
  if (errors.length > 0) {
    const messages = extractErrorMessages(errors);
    throw new DataError(messages.join(" | "));
  }
}

function extractErrorMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    if (error.children && error.children.length > 0) {
      messages.push(...extractErrorMessages(error.children));
    }
  }

  return messages;
}

export function toPlain<T>(object: T): Object {
  return instanceToPlain(object, {
    excludeExtraneousValues: true,
    exposeUnsetFields: false,
  });
}

export function toInstance<T>(object: object, cls: new () => T): T {
  return plainToInstance(cls, object, {
    excludeExtraneousValues: true,
    exposeUnsetFields: false,
  });
}

export function mapTo<T>(object: object, cls: new () => T): T {
  const plain = instanceToPlain(object, {
    ignoreDecorators: true,
    exposeUnsetFields: false,
    enableCircularCheck: true,
  });

  return plainToInstance(cls, plain, {
    ignoreDecorators: true,
    excludeExtraneousValues: true,
    exposeUnsetFields: false,
  });
}

export function toModels<T>(arr: Object[], model: new () => T): T[] {
  return arr.map((o) => toInstance(nestedKeys(o) || {}, model));
}

export function toModel<T>(obj: Object | null, model: new () => T): T {
  if (!obj) {
    throw new NotFoundError();
  }

  return toInstance(nestedKeys(obj) || {}, model);
}

export function nestedKeys(obj: Object): Object | null {
  const nested = (path: string, value: any) => {
    if (value === null) {
      return null;
    }
    const chunks = path.split(".");
    if (chunks.length <= 1) {
      return { [path]: value };
    }
    const key = chunks.shift();
    const merged = {};
    merge(merged, nested(chunks.join("."), value));
    return { [key]: merged };
  };

  const merged = {};
  for (const key of Object.keys(obj)) {
    const value = nested(key, obj[key]);
    if (value !== null) {
      merge(merged, value);
    }
  }
  return !isEmpty(merged) ? merged : null;
}
