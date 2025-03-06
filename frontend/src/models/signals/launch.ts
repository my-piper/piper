import { Launch } from "../launch";
import { Signal } from "./signal";

export class PipelineLaunchedSignal implements Signal {
  constructor(public launch: Launch) {}
}
