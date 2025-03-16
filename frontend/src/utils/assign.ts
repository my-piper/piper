export function assign<T extends Record<string, any>>(
  dst: T,
  props: Partial<T>
) {
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) {
      dst[k as keyof T] = v;
    } else {
      delete dst[k];
    }
  }
}

export function essential<T extends Record<string, any>>(
  object: T
): Partial<T> {
  const dst: Partial<T> = {};
  for (const [k, v] of Object.entries(object)) {
    if (v !== undefined) {
      dst[k as keyof T] = v;
    }
  }
  return dst;
}

export function valuable<T extends Record<string, any>>(object: T): Partial<T> {
  const dst: Partial<T> = {};
  for (const [k, v] of Object.entries(object)) {
    if (v !== undefined && v !== null) {
      dst[k as keyof T] = v;
    }
  }
  return dst;
}
