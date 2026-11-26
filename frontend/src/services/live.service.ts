import { Injectable } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { distinctUntilChanged, map } from "rxjs";
import { AppConfig } from "src/models/app-config";
import { sid } from "src/utils/string";

@Injectable({ providedIn: "root" })
export class LiveService {
  rooms = new Map<string, Set<string>>();

  private connected = false;

  constructor(
    public socket: Socket,
    config: AppConfig,
  ) {
    // The server forgets a socket's rooms when it disconnects, so every
    // connect joins all tracked rooms again.
    this.socket.on("connect", () => {
      this.connected = true;
      for (const name of this.rooms.keys()) {
        this.socket.emit("join_room", name);
      }
    });
    this.socket.on("disconnect", () => {
      this.connected = false;
    });

    // The sockets service accepts only an authenticated handshake: connect
    // while signed in, with the current token.
    config.authorization$
      .pipe(
        map((authorization) => authorization?.token || null),
        distinctUntilChanged(),
      )
      .subscribe((token) => {
        this.socket.disconnect();
        this.connected = false;
        if (token) {
          this.socket.auth = { token };
          this.socket.connect();
        }
      });
  }

  subscribe(name: string): () => void {
    const id = sid();

    let room = this.rooms.get(name);
    if (!room) {
      room = new Set<string>();
      this.rooms.set(name, room);
      if (this.connected) {
        this.socket.emit("join_room", name);
      }
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
        if (this.connected) {
          this.socket.emit("leave_room", name);
        }
        this.rooms.delete(name);
      }
    };
  }
}
