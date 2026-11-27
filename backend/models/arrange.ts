import { Expose, Type } from "core-kit/packages/transform";

export class Arrange {
  @Expose()
  @Type(() => Number)
  x: number;

  @Expose()
  @Type(() => Number)
  y: number;

  /** A canvas node's width in px (160–640); absent: the default 220. */
  @Expose()
  @Type(() => Number)
  w?: number;

  /** A canvas node shown as its title bar only. */
  @Expose()
  @Type(() => Boolean)
  collapsed?: boolean;

  /** A canvas node's tint, from the group palette (gray is no tint). */
  @Expose()
  @Type(() => String)
  color?: "gray" | "blue" | "green" | "amber" | "red" | "violet";
}
