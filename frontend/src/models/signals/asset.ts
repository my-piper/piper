import { Asset } from "../assets";
import { Signal } from "./signal";

export class AssetImportedSignal implements Signal {
  constructor(public asset: Asset) {}
}
