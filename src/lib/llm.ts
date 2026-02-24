import { createOpenAI } from '@ai-sdk/openai';

// Configure SiliconFlow as an OpenAI compatible provider
const siliconFlow = createOpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://api.siliconflow.cn/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Export a function that returns a chat model (to match existing usage)
// This ensures we use the /chat/completions endpoint
export const openrouter = (modelId: string) => siliconFlow.chat(modelId);

export const defaultModel = openrouter('deepseek-ai/DeepSeek-V3');
