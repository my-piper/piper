import mongo from "app/mongo";
import { toInstance } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { User } from "models/user";
import { checkLaunchAccess, checkLogged } from "utils/http";

// Throws unless the user may see the launch (see checkLaunchAccess).
export async function checkLaunchVisible(
  user: User | undefined,
  _id: string
): Promise<void> {
  checkLogged(user);
  const launch = await mongo.launches.findOne(
    { _id },
    { projection: { launchedBy: 1, project: 1 } }
  );
  checkLaunchAccess(user, launch && toInstance(launch, Launch));
}
