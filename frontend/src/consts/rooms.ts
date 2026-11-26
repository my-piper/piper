// Socket.io room names, mirroring backend/consts/rooms.ts. The sockets service
// lets a user join only their own user room, launches they may see and, for
// admins, the packages room.

// Events of every launch the user started.
export const USER_ROOM = (user: string) => `user:${user}`;
// Node and pipeline events of one launch.
export const LAUNCH_ROOM = (launch: string) => `launch:${launch}`;
// Node package update progress, for admins.
export const PACKAGES_ROOM = "packages";
