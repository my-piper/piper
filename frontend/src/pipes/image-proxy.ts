import { Pipe, PipeTransform } from "@angular/core";
import { Base64 } from "js-base64";
import { assign, trimEnd } from "lodash";

@Pipe({ name: "proxyImage" })
export class ImageProxyPipe implements PipeTransform {
  transform(
    src: string,
    defs: { width?: number; height?: number; format?: string } = {}
  ): string {
    const { width, height, format } = assign({ offset: 0, scale: 0.15 }, defs);
    const chunks = ["/xyz"];

    if (!!width) {
      chunks.push(`width:${width}`);
    }

    if (!!height) {
      chunks.push(`height:${height}`);
    }

    const url = /^\//.test(src) ? `local://${src}` : src;

    chunks.push(trimEnd(Base64.encode(url), "="));
    return chunks.join("/") + (!!format ? `.${format}` : "");
  }
}
