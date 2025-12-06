import { Expose, IsNotEmpty, Transform } from "core-kit/packages/transform";
import { objectsMapTransformer } from "transformers/map";
import { mapTransformer } from "transformers/object";

export class TranslateRequest {
  @IsNotEmpty()
  @Expose()
  @Transform(mapTransformer<string>)
  labels: Map<string, string>;
}

export class TranslatedLabel {
  @Expose()
  en: string;

  @Expose()
  ru: string;

  @Expose()
  de: string;

  @Expose()
  es: string;

  @Expose({ name: "pt-BR" })
  ptBR: string;

  @Expose()
  fr: string;

  @Expose()
  ja: string;

  @Expose()
  ko: string;

  @Expose({ name: "zh-CN" })
  zhCN: string;

  @Expose({ name: "zh-TW" })
  zhTW: string;

  @Expose()
  hi: string;

  @Expose()
  tr: string;

  @Expose()
  it: string;
}

export class TranslateResult {
  @Expose()
  @Transform(objectsMapTransformer(TranslatedLabel))
  labels: Map<string, TranslatedLabel>;
}
