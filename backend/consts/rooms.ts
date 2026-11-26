// Socket.io room names. The kind prefix tells the sockets service which access
// rule applies to a join (packages/sockets/authorize-room.ts); the frontend
// mirrors these builders in src/consts/rooms.ts.

export const USER_ROOM_PREFIX = "user:";
export const LAUNCH_ROOM_PREFIX = "launch:";

// Events of every launch a user started.
export const USER_ROOM = (user: string) => `${USER_ROOM_PREFIX}${user}`;
// Node and pipeline events of one launch.
export const LAUNCH_ROOM = (launch: string) => `${LAUNCH_ROOM_PREFIX}${launch}`;
// Node package update progress, for admins.
export const PACKAGES_ROOM = "packages";
