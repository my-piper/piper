import { HttpClient } from "@angular/common/http";
import { Inject, Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import * as marked from "marked";
import { Observable, of } from "rxjs";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { getLabel } from "src/ui-kit/utils/i18n";

@Pipe({ name: "markdown" })
export class MarkdownPipe implements PipeTransform {
  constructor(
    @Inject(CURRENT_LANGUAGE) private language: Languages,
    private http: HttpClient,
    private sanitizer: DomSanitizer
  ) {}

  transform(
    markdown: string,
    { safe }: { safe: boolean } = { safe: true }
  ): Observable<SafeHtml> {
    return new Observable<string | SafeHtml>((subscriber) => {
      const content = (() => {
        if (/^http\:\/\//.test(markdown)) {
          const url = markdown;
          return this.http.get<string>(url, { responseType: "text" as "json" });
        }
        return of(markdown);
      })();
      content.subscribe((content) => {
        const parsed = marked.parse(getLabel(content, this.language)) as string;
        if (safe) {
          const safe = this.sanitizer.bypassSecurityTrustHtml(parsed);
          subscriber.next(safe);
        } else {
          subscriber.next(parsed);
        }

        subscriber.complete();
      });
    });
  }
}
