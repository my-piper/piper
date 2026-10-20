import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { AppConfig } from "src/models/app-config";
import { LiveService } from "src/services/live.service";
import { MeManager } from "src/services/me.service";
import { USER_KEY } from "src/consts/core";
import { authorization } from "../../fixtures/models";
import { SOCKET_EVENTS, USER_IDS, userPlain } from "../../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";
import { provideSocketDouble, SocketDouble } from "../../helpers/socket";

/**
 * Room contract: backend/sockets.ts joins/leaves `socket.join(room)` with the
 * payload of `join_room` / `leave_room`, so both events must carry the room
 * name. User rooms are keyed by user id (backend/jobs/update-user-balance.ts
 * `notify(user, "user_balance_updated")`).
 */
describe("LiveService rooms", () => {
  let live: LiveService;
  let socket: SocketDouble;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideSocketDouble() });
    live = TestBed.inject(LiveService);
    socket = TestBed.inject(SocketDouble);
  });

  it("joins a room once for shared subscribers", () => {
    live.subscribe("launch_one");
    live.subscribe("launch_one");

    const joins = socket.emittedEvents(SOCKET_EVENTS.joinRoom);

    expect(joins).toEqual(["launch_one"]);
  });

  it("leaves with the room name only after the final release", () => {
    const first = live.subscribe("launch_one");
    const second = live.subscribe("launch_one");

    first();
    const afterFirst = socket.emittedEvents(SOCKET_EVENTS.leaveRoom);
    second();

    expect(afterFirst).toEqual([]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      "launch_one",
    ]);
    expect(live.rooms.has("launch_one")).toBeFalse();
  });

  it("keeps independent rooms independent", () => {
    const one = live.subscribe("launch_one");
    live.subscribe("launch_two");

    one();

    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      "launch_one",
      "launch_two",
    ]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      "launch_one",
    ]);
    expect(live.rooms.has("launch_two")).toBeTrue();
  });

  it("treats a repeated release as a no-op", () => {
    const first = live.subscribe("launch_one");
    const second = live.subscribe("launch_one");

    first();
    first();

    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([]);
    expect(live.rooms.get("launch_one").size).toBe(1);
    second();
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      "launch_one",
    ]);
  });

  it("does not drop a later subscriber when a stale release runs again", () => {
    const stale = live.subscribe("launch_one");
    stale();
    live.subscribe("launch_one");

    stale();

    expect(live.rooms.has("launch_one")).toBeTrue();
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      "launch_one",
      "launch_one",
    ]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      "launch_one",
    ]);
  });
});

describe("MeManager", () => {
  let controller: HttpTestingController;
  let socket: SocketDouble;

  function configure() {
    TestBed.configureTestingModule({
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSocketDouble(),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    socket = TestBed.inject(SocketDouble);
  }

  afterEach(() => controller.verify());

  it("stays anonymous and requests nothing without authorization", () => {
    configure();

    const me = TestBed.inject(MeManager);

    expect(me.user).toBeNull();
    expect(socket.emitted).toEqual([]);
  });

  it("loads the user on start and joins the user room", () => {
    seedAuthorization(userPlain("owner"));
    configure();
    const me = TestBed.inject(MeManager);

    controller.expectOne("/api/me").flush(userPlain("owner"));

    expect(me.user._id).toBe(USER_IDS.owner);
    expect(me.user.balance.remaining).toBe(8);
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      USER_IDS.owner,
    ]);
  });

  it("loads the user after login and stores it", () => {
    configure();
    const me = TestBed.inject(MeManager);
    const config = TestBed.inject(AppConfig);

    config.authorization = authorization("engineer");
    controller.expectOne("/api/me").flush(userPlain("engineer"));

    expect(me.user._id).toBe(USER_IDS.engineer);
    expect(JSON.parse(localStorage.getItem(USER_KEY))._id).toBe(
      USER_IDS.engineer,
    );
  });

  it("reloads the user on user_balance_updated without retaining extra rooms", () => {
    seedAuthorization(userPlain("owner"));
    configure();
    const me = TestBed.inject(MeManager);
    const live = TestBed.inject(LiveService);
    controller.expectOne("/api/me").flush(userPlain("owner"));
    const refill = { ...userPlain("owner"), balance: { remaining: 100 } };

    socket.receive("user_balance_updated", { user: USER_IDS.owner });
    controller.expectOne("/api/me").flush(refill);

    expect(me.user.balance.remaining).toBe(100);
    expect(live.rooms.get(USER_IDS.owner).size).toBe(1);
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      USER_IDS.owner,
    ]);
  });

  it("leaves the user room and clears the stored user on logout", () => {
    seedAuthorization(userPlain("owner"));
    configure();
    const me = TestBed.inject(MeManager);
    const live = TestBed.inject(LiveService);
    const config = TestBed.inject(AppConfig);
    controller.expectOne("/api/me").flush(userPlain("owner"));
    socket.receive("user_balance_updated", { user: USER_IDS.owner });
    controller.expectOne("/api/me").flush(userPlain("owner"));

    config.authorization = null;

    expect(me.user).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(live.rooms.size).toBe(0);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      USER_IDS.owner,
    ]);
  });

  it("switches rooms when another user signs in", () => {
    seedAuthorization(userPlain("owner"));
    configure();
    TestBed.inject(MeManager);
    const live = TestBed.inject(LiveService);
    const config = TestBed.inject(AppConfig);
    controller.expectOne("/api/me").flush(userPlain("owner"));

    config.authorization = authorization("admin");
    controller.expectOne("/api/me").flush(userPlain("admin"));

    expect([...live.rooms.keys()]).toEqual([USER_IDS.admin]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      USER_IDS.owner,
    ]);
  });
});
