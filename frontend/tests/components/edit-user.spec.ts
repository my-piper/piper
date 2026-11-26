import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  fakeAsync,
  flushMicrotasks,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { EditUserComponent } from "src/app/users/edit/edit-user.component";
import { Languages } from "src/enums/languages";
import { User } from "src/models/user";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { toInstance } from "src/utils/models";
import { userPlain } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../helpers/config";
import { finish } from "../helpers/editor";
import { editJson, JsonEditorStubComponent } from "../helpers/json-editor-stub";

/**
 * POST /api/users adds a user and PATCH /api/users/:_id saves one; both
 * answer with the stored user (backend/api/users).
 */
const UI_DELAY = 250;

function setup(user?: User) {
  seedAuthorization(userPlain("admin"));
  TestBed.configureTestingModule({
    declarations: [EditUserComponent],
    imports: [
      ReactiveFormsModule,
      UiKitModule,
      ErrorDialogComponent,
      TaigaFormsModule,
      JsonEditorStubComponent,
    ],
    providers: [
      provideTestConfig(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
      { provide: ActivatedRoute, useValue: { data: of({ user }) } },
    ],
  });
  const controller = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EditUserComponent);
  const element: HTMLElement = fixture.nativeElement;
  const added: User[] = [];
  const saved: User[] = [];
  fixture.componentInstance.added.subscribe((u) => added.push(u));
  fixture.componentInstance.saved.subscribe((u) => saved.push(u));
  fixture.detectChanges();
  flushMicrotasks();

  return {
    fixture,
    controller,
    element,
    added,
    saved,
    title: () => element.querySelector("h1").textContent.trim(),
    editor: () => element.querySelector("textarea.json-editor-stub"),
    save: () => {
      element.querySelector<HTMLButtonElement>("button[type=submit]").click();
      fixture.detectChanges();
    },
  };
}

describe("EditUserComponent", () => {
  it("adds a user from the edited fields", fakeAsync(() => {
    const page = setup();
    const typed = {
      _id: "new_user",
      email: "new@piper.test",
      roles: ["engineer"],
    };
    editJson(page.element, typed);

    page.save();
    const request = page.controller.expectOne("/api/users");
    request.flush({ ...typed, createdAt: "2026-01-02T00:00:00.000Z" });
    tick(UI_DELAY);

    expect(page.title()).toBe("Add user");
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual(typed);
    expect(page.added.map((u) => u._id)).toEqual(["new_user"]);
    expect(page.saved).toEqual([]);
    page.controller.verify();
    finish();
  }));

  it("saves an existing user with its id locked", fakeAsync(() => {
    const page = setup(toInstance(userPlain("owner"), User));
    const edited = { ...userPlain("owner"), email: "renamed@piper.test" };
    editJson(page.element, edited);

    page.save();
    const request = page.controller.expectOne("/api/users/user_owner");
    request.flush(edited);
    tick(UI_DELAY);

    expect(page.title()).toBe("user_owner");
    expect(page.editor().getAttribute("data-disable")).toBe("root._id");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body).toEqual(edited);
    expect(page.saved.map((u) => u.email)).toEqual(["renamed@piper.test"]);
    page.controller.verify();
    finish();
  }));
});
