import { Injectable } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { sid } from "src/ui-kit/utils/string";

@Injectable({ providedIn: "root" })
export class LiveService {
  rooms = new Map<string, Set<string>>();

  constructor(public socket: Socket) {}

  subscribe(name: string): () => void {
    const id = sid();

    let room = this.rooms.get(name);
    if (!room) {
      room = new Set<string>();
      this.rooms.set(name, room);
      this.socket.emit("join_room", name);
    }

    room.add(id);
    let released = false;
    return () => {
      // Releasing twice must not drop refs of the room's later subscribers.
      if (released) {
        return;
      }
      released = true;

      room.delete(id);
      if (room.size <= 0 && this.rooms.get(name) === room) {
        this.socket.emit("leave_room", name);
        this.rooms.delete(name);
      }
    };
  }
}
