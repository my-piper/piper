import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { provideTestConfig } from "./config";

/** Debounce from `markDirty` to the delayed sanitize/update. */
export const UPDATE_DEBOUNCE = 1000;
/** Debounce from the delayed update to the PATCH request. */
export const SAVE_DEBOUNCE = 3000;
/** Total quiet time after the last `markDirty` before a PATCH is sent. */
export const AUTOSAVE_DELAY = UPDATE_DEBOUNCE + SAVE_DEBOUNCE;
export { UI_DELAY };

/**
 * Real ProjectManager + HttpService over HttpTestingController.
 * Call inside `fakeAsync` so the manager's debounces use the fake clock.
 */
export function setupProjectManager() {
  TestBed.configureTestingModule({
    providers: [
      provideTestConfig(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });

  const manager = TestBed.inject(ProjectManager);
  const controller = TestBed.inject(HttpTestingController);
  const statuses: (string | null)[] = [];
  manager.status.subscribe((s) => statuses.push(s));

  return { manager, controller, statuses };
}

export function expectPatch(
  controller: HttpTestingController,
  id: string,
  revision: string,
): TestRequest {
  const request = controller.expectOne(
    (r) => r.url === `/api/projects/${id}/patch/${revision}`,
  );
  expect(request.request.method).toBe("PATCH");
  return request;
}
