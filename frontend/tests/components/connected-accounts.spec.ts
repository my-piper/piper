import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideTaiga } from "@taiga-ui/core";
import { BehaviorSubject } from "rxjs";
import { ConnectedAccountsComponent } from "src/app/connected-accounts/connected-accounts.component";
import { User } from "src/models/user";
import { NAVIGATE_TO } from "src/providers/navigate";
import { MeManager } from "src/services/me.service";
import { toInstance } from "src/utils/models";
import { userPlain } from "../fixtures/plain";
import { provideTestConfig } from "../helpers/config";
import { openDialog, popupRoot } from "../helpers/taiga";

const IDENTITY = {
  provider: "oidc",
  subject: "sso-subject",
  email: "jane@sso.test",
  linkedAt: "2026-02-03T00:00:00.000Z",
};

function meUser(fields: object): User {
  return toInstance({ ...userPlain(), ...fields }, User);
}

/** MeManager double: the user to show and the reload the component asks for. */
function meDouble(user: User) {
  return { user$: new BehaviorSubject<User | null>(user), reload: vi.fn() };
}

async function render(user: User) {
  const me = meDouble(user);
  const navigate = vi.fn();
  await TestBed.configureTestingModule({
    imports: [ConnectedAccountsComponent],
    providers: [
      provideTaiga(),
      provideTestConfig({
        ui: { features: ["oidc_auth"], oidcLabel: "Authentik" },
      }),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: MeManager, useValue: me },
      { provide: NAVIGATE_TO, useValue: navigate },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ConnectedAccountsComponent);
  fixture.detectChanges();
  const root = popupRoot();
  return {
    fixture,
    root,
    me,
    navigate,
    element: fixture.nativeElement as HTMLElement,
    controller: TestBed.inject(HttpTestingController),
  };
}

function button(element: HTMLElement, name: string) {
  return element.querySelector<HTMLButtonElement>(`[data-cy=${name}]`);
}

describe("ConnectedAccountsComponent", () => {
  it("connects through the link ticket and the single sign-on flow", async () => {
    const { fixture, element, controller, navigate } = await render(
      meUser({ hasPassword: true }),
    );

    button(element, "sso-connect").click();
    fixture.detectChanges();
    const request = controller.expectOne("/api/me/identities/oidc/link");
    request.flush(null, { status: 204, statusText: "No Content" });

    expect(button(element, "sso-connect").textContent.trim()).toBe(
      "Connect Authentik",
    );
    expect(request.request.method).toBe("POST");
    expect(navigate).toHaveBeenCalledWith("/oauth/oidc?link");
    controller.verify();
  });

  it("shows the error when the link ticket is refused", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const { fixture, root, element, controller, navigate } = await render(
      meUser({ hasPassword: true }),
    );

    button(element, "sso-connect").click();
    controller
      .expectOne("/api/me/identities/oidc/link")
      .flush("Single sign-on is disabled", {
        status: 400,
        statusText: "Bad Request",
      });
    fixture.detectChanges();
    root.detectChanges();

    expect(openDialog().textContent).toContain("Single sign-on is disabled");
    expect(navigate).not.toHaveBeenCalled();
    expect(button(element, "sso-connect").disabled).toBe(false);
    controller.verify();
  });

  it("shows the connected account and disconnects it", async () => {
    const { fixture, element, controller, me } = await render(
      meUser({ hasPassword: true, identities: [IDENTITY] }),
    );

    const shown = element.querySelector("[data-cy=sso-identity]").textContent;
    button(element, "sso-disconnect").click();
    fixture.detectChanges();
    const request = controller.expectOne("/api/me/identities/oidc");
    request.flush(null, { status: 204, statusText: "No Content" });

    expect(shown).toContain("Authentik: jane@sso.test");
    expect(shown).toContain("Connected Feb 3, 2026");
    expect(request.request.method).toBe("DELETE");
    expect(me.reload).toHaveBeenCalledTimes(1);
    controller.verify();
  });

  it("keeps the only way to sign in connected", async () => {
    const { element, controller } = await render(
      meUser({ hasPassword: false, identities: [IDENTITY] }),
    );

    expect(button(element, "sso-disconnect").disabled).toBe(true);
    expect(element.querySelector(".hint").textContent).toContain(
      "Set a password before disconnecting",
    );
    controller.verify();
  });
});
