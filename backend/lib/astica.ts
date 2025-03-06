import axios from "axios";
import { ASTICA_KEY } from "../consts/core";
import { UnknownError } from "../types/errors";

export async function describe(apiKey: string, image: Buffer): Promise<string> {
  try {
    const response = await axios({
      method: "post",
      url: "https://vision.astica.ai/describe",
      headers: {
        "Content-type": "application/json",
      },
      data: {
        tkn: apiKey || ASTICA_KEY,
        modelVersion: "2.5_full",
        gpt_prompt:
          "What is an age and body type of the person? No additional details.",
        input: image.toString("base64"),
        visionParams: "gpt, describe",
        prompt_length: 200,
      },
    });
    // console.log(response);
    const {
      data: {
        caption_GPTS,
        caption: { text },
      },
    } = response;
    return caption_GPTS;
  } catch (e) {
    throw new UnknownError(e.statusText);
  }
}
