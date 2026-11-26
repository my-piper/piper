import { provideHttpClient, withXhr } from "@angular/common/http";
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
import { USER_ROOM } from "src/consts/rooms";
import { authorization } from "../../fixtures/models";
import { SOCKET_EVENTS, USER_IDS, userPlain } from "../../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";
import { provideSocketDouble, SocketDouble } from "../../helpers/socket";

/**
 * Room contract: backend/sockets.ts accepts a socket only with a user token in
 * the handshake `auth`, and joins/leaves `socket.join(room)` with the payload
 * of `join_room` / `leave_room`, so both events carry the room name. Room
 * names come from src/consts/rooms.ts (backend/consts/rooms.ts).
 */
describe("LiveService rooms", () => {
  let live: LiveService;
  let socket: SocketDouble;

  beforeEach(() => {
    seedAuthorization(userPlain("owner"));
    TestBed.configureTestingModule({
      providers: [provideTestConfig(), provideSocketDouble()],
    });
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
    expect(live.rooms.has("launch_one")).toBe(false);
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
    expect(live.rooms.has("launch_two")).toBe(true);
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

    expect(live.rooms.has("launch_one")).toBe(true);
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      "launch_one",
      "launch_one",
    ]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      "launch_one",
    ]);
  });

  it("joins every tracked room again after a reconnect", () => {
    live.subscribe("launch_one");
    live.subscribe("launch_two");

    socket.reconnect();

    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      "launch_one",
      "launch_two",
      "launch_one",
      "launch_two",
    ]);
  });
});

describe("LiveService connection", () => {
  let socket: SocketDouble;

  function start() {
    TestBed.configureTestingModule({
      providers: [provideTestConfig(), provideSocketDouble()],
    });
    socket = TestBed.inject(SocketDouble);
    return TestBed.inject(LiveService);
  }

  it("stays offline and keeps rooms to itself while signed out", () => {
    const live = start();

    live.subscribe("launch_one");

    expect(socket.connects).toEqual([]);
    expect(socket.emitted).toEqual([]);
    expect(live.rooms.has("launch_one")).toBe(true);
  });

  it("connects with the stored user token", () => {
    seedAuthorization(userPlain("owner"), "stored-token");

    start();

    expect(socket.connects).toEqual([{ token: "stored-token" }]);
  });

  it("connects on sign-in and joins the rooms tracked before it", () => {
    const live = start();
    live.subscribe("launch_one");

    TestBed.inject(AppConfig).authorization = authorization("engineer");

    expect(socket.connects).toEqual([{ token: "fake-token-engineer" }]);
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      "launch_one",
    ]);
  });

  it("reconnects with the new token when another user signs in", () => {
    seedAuthorization(userPlain("owner"), "stored-token");
    start();

    TestBed.inject(AppConfig).authorization = authorization("admin");

    expect(socket.connects).toEqual([
      { token: "stored-token" },
      { token: "fake-token-admin" },
    ]);
    expect(socket.connected).toBe(true);
  });

  it("keeps the connection when the same token is stored again", () => {
    seedAuthorization(userPlain("owner"), "fake-token-owner");
    start();

    TestBed.inject(AppConfig).authorization = authorization("owner");

    expect(socket.connects).toEqual([{ token: "fake-token-owner" }]);
  });

  it("disconnects on sign-out without sending leaves", () => {
    seedAuthorization(userPlain("owner"));
    const live = start();
    const release = live.subscribe("launch_one");

    TestBed.inject(AppConfig).authorization = null;
    release();

    expect(socket.connected).toBe(false);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([]);
    expect(live.rooms.size).toBe(0);
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
        provideHttpClient(withXhr()),
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
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      USER_ROOM(USER_IDS.owner),
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

  it("reloads the same user on re-authorization without retaining extra rooms", () => {
    // The same token keeps the connection, so only MeManager could rejoin.
    seedAuthorization(userPlain("owner"), "fake-token-owner");
    configure();
    const me = TestBed.inject(MeManager);
    const live = TestBed.inject(LiveService);
    const config = TestBed.inject(AppConfig);
    controller.expectOne("/api/me").flush(userPlain("owner"));
    const renamed = { ...userPlain("owner"), email: "renamed@piper.test" };

    config.authorization = authorization("owner");
    controller.expectOne("/api/me").flush(renamed);

    expect(me.user.email).toBe("renamed@piper.test");
    expect(live.rooms.get(USER_ROOM(USER_IDS.owner)).size).toBe(1);
    expect(socket.emittedEvents(SOCKET_EVENTS.joinRoom)).toEqual([
      USER_ROOM(USER_IDS.owner),
    ]);
  });

  it("drops the user room and clears the stored user on logout", () => {
    seedAuthorization(userPlain("owner"));
    configure();
    const me = TestBed.inject(MeManager);
    const live = TestBed.inject(LiveService);
    const config = TestBed.inject(AppConfig);
    controller.expectOne("/api/me").flush(userPlain("owner"));

    config.authorization = null;

    expect(me.user).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(live.rooms.size).toBe(0);
    expect(socket.connected).toBe(false);
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

    expect([...live.rooms.keys()]).toEqual([USER_ROOM(USER_IDS.admin)]);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      USER_ROOM(USER_IDS.owner),
    ]);
  });
});
