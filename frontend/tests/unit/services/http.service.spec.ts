import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { Observable } from "rxjs";
import { AUTHORIZATION_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import {
  ClientClosedRequestError,
  DataError,
  InternalError,
  NetworkError,
  NotFoundError,
  RequestTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
} from "src/models/errors";
import { HttpService } from "src/services/http.service";
import {
  FAKE_TOKEN,
  provideTestConfig,
  seedAuthorization,
} from "../../helpers/config";
import {
  revisionConflict,
  schemaInvalid,
  userPlain,
} from "../../fixtures/plain";

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideTestConfig(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpService),
    controller: TestBed.inject(HttpTestingController),
    config: TestBed.inject(AppConfig),
    router: TestBed.inject(Router),
  };
}

function capture(source: Observable<unknown>) {
  const result: { value?: unknown; error?: unknown } = {};
  source.subscribe({
    next: (value) => (result.value = value),
    error: (error) => (result.error = error),
  });
  return result;
}

describe("HttpService", () => {
  describe("requests", () => {
    it("prefixes relative paths with the backend API and extracts the body", () => {
      const { http, controller } = setup();

      const result = capture(http.get("projects/p1"));
      const req = controller.expectOne("/api/projects/p1");
      req.flush({ _id: "p1" });

      expect(req.request.method).toBe("GET");
      expect(result.value).toEqual({ _id: "p1" });
      controller.verify();
    });

    it("keeps absolute URLs untouched", () => {
      const { http, controller } = setup();

      capture(http.get("https://deploy.piper.test/run"));
      const req = controller.expectOne("https://deploy.piper.test/run");
      req.flush({});

      expect(req.request.url).toBe("https://deploy.piper.test/run");
      controller.verify();
    });

    it("sends query parameters including numbers", () => {
      const { http, controller } = setup();

      capture(http.get("launches", { cursor: "c1", limit: 0 }));
      const req = controller.expectOne((r) => r.url === "/api/launches");
      req.flush([]);

      expect(req.request.params.get("cursor")).toBe("c1");
      expect(req.request.params.get("limit")).toBe("0");
      expect(req.request.urlWithParams).toBe("/api/launches?cursor=c1&limit=0");
      controller.verify();
    });

    it("adds the user token when authorized and custom headers", () => {
      seedAuthorization(userPlain("owner"));
      const { http, controller } = setup();

      capture(http.get("me", {}, { headers: { "x-extra": "1" } }));
      const req = controller.expectOne("/api/me");
      req.flush({});

      expect(req.request.headers.get("user-token")).toBe(FAKE_TOKEN);
      expect(req.request.headers.get("x-extra")).toBe("1");
      controller.verify();
    });

    it("sends no user token when anonymous", () => {
      const { http, controller } = setup();

      capture(http.get("me"));
      const req = controller.expectOne("/api/me");
      req.flush({});

      expect(req.request.headers.has("user-token")).toBeFalse();
      controller.verify();
    });

    it("posts JSON bodies as JSON", () => {
      const { http, controller } = setup();

      const result = capture(http.post("login", { identity: "a" }));
      const req = controller.expectOne("/api/login");
      req.flush({ token: "t" });

      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ identity: "a" });
      expect(req.request.detectContentTypeHeader()).toBe("application/json");
      expect(result.value).toEqual({ token: "t" });
      controller.verify();
    });

    it("sends string bodies as text and FormData without an explicit type", () => {
      const { http, controller } = setup();
      const form = new FormData();
      form.append("file", new Blob(["x"]), "a.txt");

      capture(http.put("projects/p1/readme", "# Readme"));
      capture(http.patch("assets", form));
      const text = controller.expectOne("/api/projects/p1/readme");
      const multipart = controller.expectOne("/api/assets");
      text.flush("ok");
      multipart.flush({});

      expect(text.request.method).toBe("PUT");
      expect(text.request.detectContentTypeHeader()).toBe("text/plain");
      expect(multipart.request.method).toBe("PATCH");
      expect(multipart.request.body).toBe(form);
      expect(multipart.request.detectContentTypeHeader()).toBeNull();
      expect(multipart.request.headers.has("Content-Type")).toBeFalse();
      controller.verify();
    });

    it("supports DELETE and text responses", () => {
      const { http, controller } = setup();

      const removed = capture(http.delete("deploys/d1"));
      const text = capture(http.get("export", {}, { responseType: "text" }));
      const del = controller.expectOne("/api/deploys/d1");
      const exp = controller.expectOne("/api/export");
      del.flush(null);
      exp.flush("name: pipeline");

      expect(del.request.method).toBe("DELETE");
      expect(removed.value).toBeNull();
      expect(exp.request.responseType).toBe("text");
      expect(text.value).toBe("name: pipeline");
      controller.verify();
    });
  });

  describe("errors", () => {
    beforeEach(() => spyOn(console, "error"));

    function fail(status: number, body: unknown = null, statusText = "Err") {
      const { http, controller, config, router } = setup();
      const navigate = spyOn(router, "navigate").and.resolveTo(true);
      const result = capture(http.get("projects/p1"));
      controller
        .expectOne("/api/projects/p1")
        .flush(body, { status, statusText });
      controller.verify();
      return { error: result.error as Error, config, navigate };
    }

    it("maps status 0 to NetworkError", () => {
      const { http, controller } = setup();

      const result = capture(http.get("me"));
      controller
        .expectOne("/api/me")
        .error(new ProgressEvent("error"), { status: 0 });

      expect(result.error).toBeInstanceOf(NetworkError);
      controller.verify();
    });

    it("maps a 400 text body (revision conflict) to DataError", () => {
      const conflict = revisionConflict("rev_9");

      const { error } = fail(conflict.status, conflict.body);

      expect(error).toBeInstanceOf(DataError);
      expect(error.message).toBe(
        "Version on sever is more fresh version rev_9",
      );
    });

    it("maps a 400 object body to DataError with details", () => {
      const invalid = schemaInvalid();

      const { error } = fail(invalid.status, invalid.body);

      expect(error).toBeInstanceOf(DataError);
      expect(error.message).toBe("Pipeline schema invalid");
      expect((error as DataError).details).toEqual(invalid.body.details);
    });

    it("clears authorization and redirects home on 401", () => {
      seedAuthorization(userPlain("owner"));

      const { error, config, navigate } = fail(401, "Unauthorized");

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(config.authorization).toBeNull();
      expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(["/"]);
    });

    const mapped: [number, new (...args: never[]) => Error][] = [
      [404, NotFoundError],
      [413, RequestTooLargeError],
      [429, TooManyRequestsError],
      [499, ClientClosedRequestError],
      [500, InternalError],
    ];

    for (const [status, type] of mapped) {
      it(`maps ${status} to ${type.name}`, () => {
        const { error, navigate } = fail(status, "message");

        expect(error).toBeInstanceOf(type);
        expect(navigate).not.toHaveBeenCalled();
      });
    }

    it("maps other 5xx to a service-offline InternalError", () => {
      const { error } = fail(503, "<html>bad gateway</html>");

      expect(error).toBeInstanceOf(InternalError);
      expect(error.message).toBe(
        "SERVICE_OFFLINE|Our service temporarily unavailable",
      );
    });

    it("maps an unmapped 4xx to a plain Error with the server message", () => {
      const { error } = fail(403, "Forbidden for you");

      expect(error.constructor).toBe(Error);
      expect(error.message).toBe("Forbidden for you");
    });

    it("keeps authorization on non-401 errors", () => {
      seedAuthorization(userPlain("owner"));

      const { config } = fail(500, "boom");

      expect(config.authorization.token).toBe(FAKE_TOKEN);
    });
  });
});
