export type ModelTier = "fast" | "balanced" | "powerful";

// TechSpec "Core Interfaces" LLMProvider shape
export interface LLMChatRequest {
  systemPrompt: string;
  userMessage: string;
  tier: ModelTier;
}

export interface LLMChatResponse {
  content: string;
  tokens: { input: number; output: number };
}

export interface LLMProvider {
  chat(req: LLMChatRequest): Promise<LLMChatResponse>;
}

export interface ModelConfig {
  fast: string;
  balanced: string;
  powerful: string;
}

export interface ProviderConfig {
  kind: "api" | "claude-code";
  models: ModelConfig;
  apiKey?: string;
  claudeCliPath?: string;
}
