import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { Delta, patch } from "jsondiffpatch";
import { cloneDeep } from "lodash";
import { DataError, InternalError } from "src/models/errors";
import { Project } from "src/models/project";
import { toPlain } from "src/utils/models";
import {
  AUTOSAVE_DELAY,
  expectPatch,
  setupProjectManager,
  UI_DELAY,
  UPDATE_DEBOUNCE,
} from "../../helpers/project-manager";
import { projectA, projectB } from "../../fixtures/models";
import {
  patchResponsePlain,
  PROJECT_A_ID,
  PROJECT_B_ID,
  revisionConflict,
} from "../../fixtures/plain";
import { expectConsoleError } from "../../helpers/console";

type Body = {
  pipeline?: Delta;
  launchRequest?: Delta;
  environment?: Delta;
};

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function snapshot(project: Project) {
  return {
    pipeline: toPlain(project.pipeline),
    launchRequest: toPlain(project.launchRequest),
    environment: toPlain(project.environment),
  };
}

describe("ProjectManager autosave", () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it("sends no patch for an unchanged project", fakeAsync(() => {
    const { manager, statuses } = setupProjectManager();
    manager.project = projectA();

    manager.kick();

    expect(statuses).toEqual([null, "saved"]);
  }));

  it("coalesces rapid edits into one patch after the debounce", fakeAsync(() => {
    const { manager, controller } = setupProjectManager();
    const project = projectA();
    manager.project = project;
    const baseline = cloneDeep(snapshot(project));

    project.pipeline.nodes.get("node_one").arrange.x = 1;
    manager.markDirty();
    tick(500);
    project.pipeline.nodes.get("node_one").arrange.x = 2;
    manager.markDirty();
    tick(900);
    project.pipeline.nodes.get("node_two").title = "Renamed";
    manager.markDirty();
    tick(AUTOSAVE_DELAY - 1);
    controller.expectNone(() => true);
    tick(1);
    const request = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
    const body = request.request.body as Body;
    request.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);

    expect(Object.keys(body)).toEqual(["pipeline"]);
    expect(json(patch(baseline.pipeline, body.pipeline))).toEqual(
      json(toPlain(project.pipeline)),
    );
    expect(project.pipeline.nodes.get("node_one").arrange.x).toBe(2);
    expect(manager.status.value).toBe("saved");
  }));

  it("publishes updates immediately after a quiet period and again after the debounce", fakeAsync(() => {
    const { manager, controller } = setupProjectManager();
    manager.project = projectA();
    const initiator = { source: "test" };
    const updates: unknown[] = [];
    manager.updates.subscribe((u) => updates.push(u));
    tick(UPDATE_DEBOUNCE + 1);

    manager.markDirty(initiator);
    const immediate = [...updates];
    tick(UPDATE_DEBOUNCE);
    const delayed = [...updates];
    tick(AUTOSAVE_DELAY);

    expect(immediate).toEqual([initiator]);
    expect(delayed).toEqual([initiator, initiator]);
    expect(manager.status.value).toBe("saved");
    controller.expectNone(() => true);
  }));

  it("sanitizes the graph before the patch is built", fakeAsync(() => {
    const { manager, controller } = setupProjectManager();
    const project = projectA();
    manager.project = project;

    project.pipeline.nodes.delete("node_one");
    manager.markDirty();
    tick(AUTOSAVE_DELAY);
    const request = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
    request.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);

    expect(project.pipeline.start.nodes).toEqual([]);
    expect(project.pipeline.inputs.has("topic")).toBeFalse();
    expect(project.pipeline.flows.has("one_to_two")).toBeFalse();
    expect(project.launchRequest.nodes.has("node_one")).toBeFalse();
  }));

  it("saves immediately on kick and advances the revision", fakeAsync(() => {
    const { manager, controller, statuses } = setupProjectManager();
    const project = projectA();
    manager.project = project;

    project.pipeline.nodes.get("node_one").title = "Kicked";
    manager.kick();
    const request = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
    request.flush(patchResponsePlain("rev_a_2"));
    const beforeDelay = project.revision;
    tick(UI_DELAY);

    expect(beforeDelay).toBe("rev_a_1");
    expect(project.revision).toBe("rev_a_2");
    expect(statuses).toEqual([null, "saving", "saved"]);
  }));

  it("sends only the sections that changed, as deltas over the last snapshot", fakeAsync(() => {
    const { manager, controller } = setupProjectManager();
    const project = projectA();
    manager.project = project;
    const baseline = cloneDeep(snapshot(project));

    project.pipeline.nodes.get("node_two").arrange.y = 99;
    project.launchRequest.inputs.set("zero", 1);
    project.launchRequest.inputs.set("empty", "");
    project.environment.variables.set("RETRIES", 3);
    manager.kick();
    const first = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
    const body = first.request.body as Body;
    first.flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);
    project.environment.variables.set("NEW", false);
    manager.kick();
    const second = expectPatch(controller, PROJECT_A_ID, "rev_a_2");
    const secondBody = second.request.body as Body;
    second.flush(patchResponsePlain("rev_a_3"));
    tick(UI_DELAY);

    expect(json(patch(baseline.pipeline, body.pipeline))).toEqual(
      json(toPlain(project.pipeline)),
    );
    expect(
      json(patch(baseline.launchRequest, body.launchRequest)).inputs,
    ).toEqual({ topic: "Cats", zero: 1, off: false, empty: "" });
    expect(Object.keys(secondBody)).toEqual(["environment"]);
    expect(
      json(
        patch(
          patch(baseline.environment, body.environment),
          secondBody.environment,
        ),
      ),
    ).toEqual({
      variables: { API_URL: "http://dummy.piper.test", RETRIES: 3, NEW: false },
    });
    expect(project.revision).toBe("rev_a_3");
  }));

  describe("failures", () => {
    it("keeps edits after a failed save and resends them on retry", fakeAsync(() => {
      expectConsoleError("Process HTTP error 500");
      const { manager, controller, statuses } = setupProjectManager();
      const project = projectA();
      manager.project = project;
      const baseline = cloneDeep(snapshot(project));

      project.pipeline.nodes.get("node_one").title = "Unsaved";
      manager.kick();
      expectPatch(controller, PROJECT_A_ID, "rev_a_1").flush("boom", {
        status: 500,
        statusText: "Internal Server Error",
      });
      const failedRevision = project.revision;
      const error = manager.error.value;
      manager.kick();
      const retry = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      const body = retry.request.body as Body;
      retry.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      expect(error).toBeInstanceOf(InternalError);
      expect(failedRevision).toBe("rev_a_1");
      expect(json(patch(baseline.pipeline, body.pipeline))).toEqual(
        json(toPlain(project.pipeline)),
      );
      expect(project.revision).toBe("rev_a_2");
      expect(statuses).toEqual([null, "saving", "error", "saving", "saved"]);
    }));

    it("reports a revision conflict without advancing the revision or dropping edits", fakeAsync(() => {
      expectConsoleError("Process HTTP error 400");
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;
      const conflict = revisionConflict("rev_server");

      project.launchRequest.inputs.set("topic", "Dogs");
      manager.kick();
      expectPatch(controller, PROJECT_A_ID, "rev_a_1").flush(conflict.body, {
        status: conflict.status,
        statusText: conflict.statusText,
      });
      const error = manager.error.value;
      manager.kick();
      const retry = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      const body = retry.request.body as Body;
      retry.flush(conflict.body, {
        status: conflict.status,
        statusText: conflict.statusText,
      });

      expect(error).toBeInstanceOf(DataError);
      expect(error.message).toContain("rev_server");
      expect(manager.status.value).toBe("error");
      expect(project.revision).toBe("rev_a_1");
      expect(Object.keys(body)).toEqual(["launchRequest"]);
    }));
  });

  describe("concurrency", () => {
    it("saves edits made while a kicked save is in flight", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;

      project.pipeline.nodes.get("node_one").title = "First";
      manager.kick();
      const first = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      project.pipeline.nodes.get("node_one").title = "Second";
      manager.kick();
      controller.expectNone(() => true);
      first.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      const second = expectPatch(controller, PROJECT_A_ID, "rev_a_2");
      const body = second.request.body as Body;
      second.flush(patchResponsePlain("rev_a_3"));
      tick(UI_DELAY);

      expect(JSON.stringify(body.pipeline)).toContain("Second");
      expect(project.revision).toBe("rev_a_3");
      expect(manager.status.value).toBe("saved");
    }));

    it("does not send a second patch with a stale revision while one is in flight", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;

      project.pipeline.nodes.get("node_one").title = "First";
      manager.kick();
      const first = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      project.pipeline.nodes.get("node_one").title = "Second";
      manager.markDirty();
      tick(AUTOSAVE_DELAY);
      controller.expectNone(() => true);
      first.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      const second = expectPatch(controller, PROJECT_A_ID, "rev_a_2");
      second.flush(patchResponsePlain("rev_a_3"));
      tick(UI_DELAY);

      expect(project.revision).toBe("rev_a_3");
      expect(manager.status.value).toBe("saved");
    }));

    it("stays dirty when a save completes while newer edits are pending", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;

      project.pipeline.nodes.get("node_one").title = "First";
      manager.kick();
      const first = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      project.pipeline.nodes.get("node_one").title = "Second";
      manager.markDirty();
      first.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      const afterFirst = manager.status.value;
      tick(AUTOSAVE_DELAY);
      const second = expectPatch(controller, PROJECT_A_ID, "rev_a_2");
      const body = second.request.body as Body;
      second.flush(patchResponsePlain("rev_a_3"));
      tick(UI_DELAY);

      expect(afterFirst).toBe("dirty");
      expect(JSON.stringify(body.pipeline)).toContain("Second");
      expect(manager.status.value).toBe("saved");
    }));

    it("ignores a late response after switching to another project", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const a = projectA();
      const b = projectB();
      manager.project = a;

      a.pipeline.nodes.get("node_one").title = "A edit";
      manager.kick();
      const late = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      manager.project = b;
      late.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      manager.kick();
      b.pipeline.nodes.get("node_two").title = "B edit";
      manager.kick();
      const bRequest = expectPatch(controller, PROJECT_B_ID, "rev_b_1");
      const body = bRequest.request.body as Body;
      bRequest.flush(patchResponsePlain("rev_b_2", "engineer"));
      tick(UI_DELAY);

      expect(JSON.stringify(body.pipeline)).toContain("B edit");
      expect(JSON.stringify(body.pipeline)).not.toContain("A edit");
      expect(b.revision).toBe("rev_b_2");
      expect(manager.status.value).toBe("saved");
    }));

    it("tolerates clearing the project before a pending autosave fires", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;

      project.pipeline.nodes.get("node_one").title = "Abandoned";
      manager.markDirty();
      manager.project = null;
      tick(AUTOSAVE_DELAY);

      controller.expectNone(() => true);
      expect(manager.project).toBeNull();
    }));

    it("tolerates clearing the project before an in-flight response", fakeAsync(() => {
      const { manager, controller } = setupProjectManager();
      const project = projectA();
      manager.project = project;

      project.pipeline.nodes.get("node_one").title = "Saved late";
      manager.kick();
      const late = expectPatch(controller, PROJECT_A_ID, "rev_a_1");
      manager.project = null;
      late.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      manager.project = projectB();
      manager.kick();

      expect(manager.snapshots.pipeline).toEqual(
        toPlain(manager.project.pipeline),
      );
      expect(manager.project.revision).toBe("rev_b_1");
      expect(manager.status.value).toBe("saved");
    }));
  });
});
