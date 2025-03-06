import { Injectable } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { SHORT_ID as shortId } from "src/consts/core";

@Injectable({ providedIn: "root" })
export class LiveService {
  rooms = new Map<string, Set<string>>();

  constructor(public socket: Socket) {}

  subscribe(name: string): () => void {
    const id = shortId();

    let room = this.rooms.get(name);
    if (!room) {
      room = new Set<string>();
      this.rooms.set(name, room);
      this.socket.emit("join_room", name);
    }

    room.add(id);
    return () => {
      room.delete(id);
      if (room.size <= 0) {
        this.socket.emit("leave_room", id);
        this.rooms.delete(name);
      }
    };
  }
}
