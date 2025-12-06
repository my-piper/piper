import { ActivatedRoute } from "@angular/router";

export function getRoutes(route: ActivatedRoute): ActivatedRoute[] {
  const result: ActivatedRoute[] = [route];

  for (const child of route.children) {
    result.push(...getRoutes(child));
  }

  return result;
}

export function getMergedData(route: ActivatedRoute): Record<string, any> {
  return getRoutes(route).reduce((acc, r) => {
    const data = r.snapshot?.data || {};
    return { ...acc, ...data };
  }, {});
}
