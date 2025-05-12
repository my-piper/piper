import { Languages } from "core-kit/packages/locale";
import { User } from "models/user";

export type Injector = {
  currentUser?: User;
  language: Languages;
};
