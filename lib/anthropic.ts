import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model — Claude Sonnet 4.6 (per Anthropic docs as of 2025-2026)
export const DEFAULT_MODEL = "claude-sonnet-4-6";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
