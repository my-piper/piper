import { Expose, Type } from "class-transformer";
import { IsEnum, IsNotEmpty } from "class-validator";

export class LlmMessage {
  @IsEnum(["assistant", "user", "system"])
  @Expose()
  @Type()
  role: "assistant" | "user" | "system";

  @IsNotEmpty()
  @Expose()
  @Type()
  content: string;
}

export class LlmAnswer {
  @IsNotEmpty()
  @Expose()
  @Type(() => LlmMessage)
  message: LlmMessage;
}
