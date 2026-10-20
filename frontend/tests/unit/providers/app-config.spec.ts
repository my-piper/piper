import { AUTHORIZATION_KEY } from "src/consts/core";
import { AppConfig, BillingConfig, UiConfig } from "src/models/app-config";
import { Authorization } from "src/models/authorisation";
import { User } from "src/models/user";
import { appConfigFactory } from "src/providers/app-config";
import { authorization } from "../../fixtures/models";
import { authorizationPlain } from "../../fixtures/plain";
import {
  RUNTIME_VARIANTS,
  TEST_BASE_URL,
  testRuntimeConfig,
} from "../../fixtures/runtime-config";
import { installPrerender, seedAuthorization } from "../../helpers/config";

describe("app config", () => {
  describe("appConfigFactory", () => {
    it("reads the PRERENDER constant into typed config", () => {
      installPrerender(testRuntimeConfig(RUNTIME_VARIANTS.billingOn()));

      const config = appConfigFactory();

      expect(config).toBeInstanceOf(AppConfig);
      expect(config.billing).toBeInstanceOf(BillingConfig);
      expect(config.billing.active).toBeTrue();
      expect(config.ui).toBeInstanceOf(UiConfig);
      expect(config.ui.features).toEqual(["signup"]);
      expect(config.baseUrl).toBe(TEST_BASE_URL);
    });

    it("applies feature variants without touching other fields", () => {
      installPrerender(testRuntimeConfig(RUNTIME_VARIANTS.signupOff()));

      const config = appConfigFactory();

      expect(config.ui.features).toEqual([]);
      expect(config.captcha.required).toBeFalse();
      expect(config.billing.active).toBeFalse();
    });

    it("falls back to the prerender copy in localStorage", () => {
      installPrerender(null);
      localStorage.setItem(
        "prerender",
        JSON.stringify({
          config: testRuntimeConfig({ baseUrl: "http://stored.test" }),
        }),
      );

      const config = appConfigFactory();

      expect(config.baseUrl).toBe("http://stored.test");
    });

    it("falls back to built-in defaults when nothing is stored", () => {
      installPrerender(null);

      const config = appConfigFactory();

      expect(config).toBeInstanceOf(AppConfig);
      expect(config.baseUrl).toBe(location.origin);
      expect(config.ui.features).toContain("signup");
    });
  });

  describe("authorization", () => {
    it("restores a stored authorization on construction", () => {
      seedAuthorization(authorizationPlain("engineer")["user"] as object);

      const config = appConfigFactory();

      expect(config.authorization).toBeInstanceOf(Authorization);
      expect(config.authorization.user).toBeInstanceOf(User);
      expect(config.authorization.user._id).toBe("user_engineer");
    });

    it("persists and publishes a new authorization", () => {
      const config = appConfigFactory();
      const seen: (Authorization | null)[] = [];
      config.authorization$.subscribe((a) => seen.push(a));

      config.authorization = authorization("owner");

      const stored = JSON.parse(localStorage.getItem(AUTHORIZATION_KEY));
      expect(stored.token).toBe("fake-token-owner");
      expect(stored.user._id).toBe("user_owner");
      expect(seen.length).toBe(2);
      expect(seen[1].token).toBe("fake-token-owner");
    });

    it("clears stored authorization when set to null", () => {
      seedAuthorization(authorizationPlain()["user"] as object);
      const config = appConfigFactory();

      config.authorization = null;

      expect(localStorage.getItem(AUTHORIZATION_KEY)).toBeNull();
      expect(config.authorization).toBeNull();
    });
  });
});
