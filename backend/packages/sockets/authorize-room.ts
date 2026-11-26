import { LAUNCH_ROOM_PREFIX, PACKAGES_ROOM, USER_ROOM } from "consts/rooms";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { User } from "models/user";
import { checkLaunchVisible } from "packages/launches/access";
import { isAdmin } from "utils/http";

// Whether a user may join a socket.io room (names from consts/rooms.ts):
// their own user room, a launch they may see, the packages room for admins.
// Any other room is refused.
export async function authorizeRoom(user: User, room: string) {
  if (room === USER_ROOM(user._id)) {
    return true;
  }

  if (room === PACKAGES_ROOM) {
    return isAdmin(user);
  }

  if (room.startsWith(LAUNCH_ROOM_PREFIX)) {
    const launch = room.slice(LAUNCH_ROOM_PREFIX.length);
    try {
      await checkLaunchVisible(user, launch);
      return true;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof DataError) {
        return false;
      }
      throw err;
    }
  }

  return false;
}
