export type ModelTier = "fast" | "balanced" | "powerful";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatParams {
  systemPrompt: string;
  messages: Message[];
  model?: ModelTier;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>;
}
