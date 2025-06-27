import { Languages } from "core-kit/packages/locale";
import { User } from "models/user";

export type Injector = {
  ip: string;
  currentUser?: User;
  language: Languages;
};
