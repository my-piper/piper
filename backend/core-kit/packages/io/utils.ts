import { toPlain } from "core-kit/packages/transform";
import io from "./io";

export function notify<T extends object | null>(
  room: string,
  eventName: string,
  event: T = null,
) {
  io.to(room).emit(eventName, !!event ? toPlain(event) : null);
}
