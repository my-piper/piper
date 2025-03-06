import { Expose, Type } from "class-transformer";

export class DetectedLanguage {
  @Expose()
  @Type(() => String)
  confidence: number;

  @Expose()
  @Type(() => String)
  language: string;
}

export class TranslateTextAnswer {
  @Expose()
  @Type(() => String)
  alternatives: string[];

  @Expose()
  @Type(() => DetectedLanguage)
  detectedLanguage: DetectedLanguage[];

  @Expose()
  @Type(() => String)
  text: string;
}
