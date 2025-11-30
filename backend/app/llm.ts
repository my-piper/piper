import { LLM_API_KEY } from "consts/llm";
import OpenAI from "openai";

export default new OpenAI({
  apiKey: LLM_API_KEY,
});

export type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;
