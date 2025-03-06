import sharp, { Sharp } from "sharp";
import { DataError } from "../types/errors";

export async function fit(
  image: Sharp,
  {
    maxWidth,
    maxHeight,
  }: {
    maxWidth: number;
    maxHeight: number;
  }
): Promise<Sharp> {
  const { width, height } = await image.metadata();
  const orientation: "-" | "|" = width >= height ? "-" : "|";

  switch (orientation) {
    case "-":
      if (width > maxWidth) {
        return sharp(await image.resize({ width: maxWidth }).toBuffer());
      }
      break;
    case "|":
      if (height > maxHeight) {
        return sharp(await image.resize({ height: maxHeight }).toBuffer());
      }
      break;
  }

  return image;
}

// w: 400, h: 800, aspectRatio: 1/2
// auto:1600
// 1600:auto
export function fitSize(
  imageSize: string,
  aspectRatio: number
): { width: number; height: number } {
  const [w, h] = imageSize.split(":");
  if (w === "auto") {
    const target = parseInt(h);
    return { height: target, width: Math.ceil(target * aspectRatio) };
  }

  if (h === "auto") {
    const target = parseInt(w);
    return { width: target, height: Math.ceil(target * aspectRatio) };
  }

  throw new DataError(`Wrong image size format: ${imageSize}`);
}
