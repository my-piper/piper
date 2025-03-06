import { Languages } from "core-kit/enums/languages";
import { User } from "../models/user";

export type Injector = {
  currentUser?: User;
  language: Languages;
};
