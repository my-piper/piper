import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "fileType",
  standalone: false,
})
export class FileTypePipe implements PipeTransform {
  transform(url: string): string {
    const match = url.match(/\.([a-zA-Z0-9]+)$/);
    switch (match[1]) {
      case "png":
      case "jpeg":
      case "jpg":
      case "webp":
      case "gif":
        return "image";
      case "mp4":
      case "webm":
        return "video";
      default:
        return "unknown";
    }
  }
}
