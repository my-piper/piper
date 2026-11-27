import { AsyncPipe } from "@angular/common";
import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ChangeDetectionStrategy, Component, Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, Subject } from "rxjs";
import { Pipeline } from "src/models/pipeline";
import { DeclaredVariablesPipe } from "src/pipes/declared-variables";
import { LaunchHeartbeatPipe } from "src/pipes/launch-heartbeat";
import { InputFlowsPipe, InputOffsetPipe, NodePipe } from "src/pipes/node";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { TickerPipe } from "src/pipes/ticker.pipe";
import { ProjectManager } from "src/services/project.manager";
import { smallGraph } from "../../fixtures/models";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";
import { userPlain } from "../../fixtures/plain";
import { provideSocketDouble, SocketDouble } from "../../helpers/socket";
import { LAUNCH_ROOM } from "src/consts/rooms";

/**
 * Pipes that subscribe on first transform must release their subscriptions
 * when the view hosting them is destroyed. The hosts declare the pipes in a
 * plain JIT testing module, like AppModule does.
 */
function projectManagerDouble() {
  return {
    updates: new Subject<object | null>(),
    status: new BehaviorSubject<string | null>(null),
  };
}

@Component({
  selector: "app-ticker-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "{{ source | ticker: 50 | async }}",
})
class TickerHostComponent {
  source = new BehaviorSubject("first");
}

@Component({
  selector: "app-project-pipes-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    {{ (pipeline | node: "node_one" | async)?.title }}
    {{ pipeline.nodes.get("node_one") | inputOffset: "prompt" | async }}
    {{ (pipeline | inputFlows: "node_two" : "text" | async)?.length }}
    {{ (pipeline | declaredVariables | async)?.size }}
  `,
})
class ProjectPipesHostComponent {
  pipeline: Pipeline = smallGraph();
}

@Component({
  selector: "app-node-updates-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "{{ (project | pipelineNodeUpdates | async) === null }}",
})
class NodeUpdatesHostComponent {
  project = "project_a";
}

@Component({
  selector: "app-heartbeat-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "{{ (launch | launchHeartbeat | async) === null }}",
})
class HeartbeatHostComponent {
  launch = "launch_a";
}

describe("pipe teardown", () => {
  let manager: ReturnType<typeof projectManagerDouble>;
  let socket: SocketDouble;
  let http: HttpTestingController;

  beforeEach(() => {
    manager = projectManagerDouble();
    socket = new SocketDouble();
    // The socket connects only while signed in.
    seedAuthorization(userPlain("owner"));
    TestBed.configureTestingModule({
      declarations: [
        TickerPipe,
        NodePipe,
        InputOffsetPipe,
        InputFlowsPipe,
        DeclaredVariablesPipe,
        PipelineNodeUpdatesPipe,
        LaunchHeartbeatPipe,
        TickerHostComponent,
        ProjectPipesHostComponent,
        NodeUpdatesHostComponent,
        HeartbeatHostComponent,
      ],
      imports: [AsyncPipe],
      providers: [
        provideTestConfig(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideSocketDouble(socket),
        { provide: ProjectManager, useValue: manager },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render<T>(host: Type<T>) {
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    return fixture;
  }

  it("stops the ticker and its source subscription with the host view", () => {
    vi.useFakeTimers();
    const fixture = render(TickerHostComponent);
    const source = fixture.componentInstance.source;
    const observedWhileRendered = source.observed;

    fixture.destroy();

    expect(observedWhileRendered).toBe(true);
    expect(source.observed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases project manager updates with the host view", () => {
    const fixture = render(ProjectPipesHostComponent);
    const observedWhileRendered = manager.updates.observed;

    fixture.destroy();

    expect(observedWhileRendered).toBe(true);
    expect(manager.updates.observed).toBe(false);
  });

  it("releases project save status with the host view", () => {
    const fixture = render(NodeUpdatesHostComponent);
    http.expectOne("/api/projects/project_a/check-node-updates").flush(null);
    const observedWhileRendered = manager.status.observed;

    fixture.destroy();

    expect(observedWhileRendered).toBe(true);
    expect(manager.status.observed).toBe(false);
  });

  it("leaves the launch room and stops heartbeat events with the host view", () => {
    const fixture = render(HeartbeatHostComponent);
    http
      .expectOne((req) => req.url.endsWith("launches/launch_a/heartbeat"))
      .flush("");
    const listenersWhileRendered = socket.listenerCount("launch_heartbeat");

    fixture.destroy();

    expect(listenersWhileRendered).toBe(1);
    expect(socket.listenerCount("launch_heartbeat")).toBe(0);
    expect(socket.emittedEvents("leave_room")).toEqual([
      LAUNCH_ROOM("launch_a"),
    ]);
  });
});
