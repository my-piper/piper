import { instanceToPlain, plainToInstance } from "class-transformer";

export function toPlain<T>(object: T): any {
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
  return plainToInstance(cls, object, {
    excludeExtraneousValues: true,
    exposeUnsetFields: false,
  });
}
