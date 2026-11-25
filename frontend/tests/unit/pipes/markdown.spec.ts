import { AsyncPipe } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { Component, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Languages } from "src/enums/languages";
import { MarkdownPipe } from "src/pipes/markdown";
import { CURRENT_LANGUAGE } from "src/providers/current-language";

@Component({
  selector: "app-markdown-host",
  template: `
    <div class="trusted" [innerHTML]="source() | markdown | async"></div>
    <div
      class="sanitized"
      [innerHTML]="source() | markdown: { safe: false } | async"
    ></div>
  `,
  imports: [AsyncPipe],
  standalone: false,
})
class MarkdownHostComponent {
  source = input.required<string>();
}

function render(source: string, language = Languages.en) {
  TestBed.configureTestingModule({
    declarations: [MarkdownHostComponent, MarkdownPipe],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: language },
    ],
  });
  const fixture = TestBed.createComponent(MarkdownHostComponent);
  fixture.componentRef.setInput("source", source);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("MarkdownPipe", () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it("renders Markdown as HTML", () => {
    const element = render("# Title\n\nSome **bold** text");

    const trusted = element.querySelector(".trusted");
    expect(trusted.querySelector("h1").textContent).toBe("Title");
    expect(trusted.querySelector("strong").textContent).toBe("bold");
  });

  it("renders the Markdown for the current language", () => {
    const element = render("# English\n---de---\n# Deutsch", Languages.de);

    expect(element.querySelector(".trusted h1").textContent).toBe("Deutsch");
  });

  it("strips scripts and event handlers when the HTML is not trusted", () => {
    const element = render(
      '**text**\n\n<img src="x" onerror="alert(1)"><script>alert(2)</script>',
    );

    const sanitized = element.querySelector(".sanitized");
    expect(sanitized.querySelector("strong").textContent).toBe("text");
    expect(sanitized.querySelector("img").getAttribute("onerror")).toBeNull();
    expect(sanitized.querySelector("script")).toBeNull();
  });
});
