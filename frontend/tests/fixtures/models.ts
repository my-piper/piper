import { Authorization } from "src/models/authorisation";
import { Launch } from "src/models/launch";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { User } from "src/models/user";
import { toInstance } from "src/utils/models";
import {
  authorizationPlain,
  launchPlain,
  launchRequestPlain,
  Plain,
  projectAPlain,
  projectBPlain,
  smallGraphPipeline,
  userPlain,
  UserKind,
} from "./plain";

/**
 * Typed fixture factories. Each call converts a fresh plain fixture through the
 * production `toInstance`, so Maps, Dates and nested classes are real.
 */

export function projectA(): Project {
  return toInstance(projectAPlain(), Project);
}

export function projectB(): Project {
  return toInstance(projectBPlain(), Project);
}

/** Project built from an arbitrary plain pipeline (e.g. a graph variant). */
export function projectWith(pipeline: Plain, base = projectAPlain()): Project {
  return toInstance({ ...base, pipeline }, Project);
}

export function smallGraph(): Pipeline {
  return toInstance(smallGraphPipeline(), Pipeline);
}

export function launchRequest(): LaunchRequest {
  return toInstance(launchRequestPlain(), LaunchRequest);
}

export function launch(projectId?: string): Launch {
  return toInstance(launchPlain(projectId), Launch);
}

export function user(kind: UserKind = "owner"): User {
  return toInstance(userPlain(kind), User);
}

export function authorization(kind: UserKind = "owner"): Authorization {
  return toInstance(authorizationPlain(kind), Authorization);
}
