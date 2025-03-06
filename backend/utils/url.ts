export function stringifyParams(obj: Object) {
  let params = [];
  Object.keys(obj).forEach((key) => {
    const isObject = typeof obj[key] === "object";
    const isArray = isObject && obj[key]?.length >= 0;
    if (!isObject) {
      params.push(`${key}=${obj[key]}`);
    }

    if (isObject && isArray) {
      obj[key].forEach((element) => {
        params.push(`${key}=${encodeURIComponent(element)}`);
      });
    }
  });

  return params.join("&");
}
