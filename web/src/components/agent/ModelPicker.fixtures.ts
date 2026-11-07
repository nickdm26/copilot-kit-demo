import type { ModelOption } from "./ModelPicker";

export const FIXTURE_MODELS: ModelOption[] = [
  { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5", shortName: "Claude", provider: "Anthropic", speed: "Smart" },
  { id: "gpt-5-mini", name: "GPT-5 mini", shortName: "GPT-5", provider: "OpenAI", speed: "Fast" },
  { id: "llama-4-maverick", name: "Llama 4 Maverick", shortName: "Llama 4", provider: "Meta", speed: "Balanced" },
];
