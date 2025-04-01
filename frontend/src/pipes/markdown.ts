import { HttpClient } from "@angular/common/http";
import { Inject, Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import * as marked from "marked";
import { Observable, of } from "rxjs";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";

const SPLIT_REGEX = /---\s*(\w+)\s*---\s*\n/g;

function i18n(text: string, language: Languages): string {
  const chunks = text.split(SPLIT_REGEX);
  const en = chunks[0];

  const languages: { [key: string]: string } = {};
  for (let i = 1; i < chunks.length; i += 2) {
    const [l, c] = [chunks[i], chunks[i + 1]];
    languages[l] = c;
  }

  return languages[language as string] || en;
}

@Pipe({ name: "markdown" })
export class MarkdownPipe implements PipeTransform {
  constructor(
    @Inject(CURRENT_LANGUAGE) private language: Languages,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  transform(markdown: string): Observable<SafeHtml> {
    return new Observable<SafeHtml>((subscriber) => {
      const content = (() => {
        if (/^https\:\/\//.test(markdown)) {
          const url = markdown;
          return this.http.get<string>(url, { responseType: "text" as "json" });
        }
        return of(markdown);
      })();
      content.subscribe((content) => {
        const parsed = marked.parse(i18n(content, this.language)) as string;
        const safe = this.sanitizer.bypassSecurityTrustHtml(parsed);
        subscriber.next(safe);
        subscriber.complete();
      });
    });
  }
}
