
import { generateText } from 'ai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars before importing anything that uses them
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Now import the LLM provider
const { openrouter } = require('../src/lib/llm');

// Mock Data
const sampleData = {
  title: "人工智能在医疗诊断中的初步应用",
  description: "探讨AI在医学影像分析中的具体应用场景及其优势。",
  content: "AI技术现在特别火，很多医院都引进了。比如在拍片子的时候，AI能帮医生一起看，这样能减少漏诊。而且AI不知疲倦，能一直工作，这对于缓解医生压力很有帮助。未来AI肯定会通过图灵测试，取代很多医生的工作。"
};

const prompts = [
  {
    name: "Baseline (Current)",
    template: (data: any) => `
You are a professional book editor. 
Analyze the following section of a book:
Title: ${data.title}
Description/Requirements: ${data.description || 'N/A'}
Current Content: 
"""
${data.content || '(No content yet)'}
"""

Your task is to provide a single, specific, and actionable revision suggestion to improve this section.
- If the content is missing, suggest: "根据描述生成正文内容，注意..."
- If the content exists, suggest improvements regarding tone, clarity, depth, or specific missing details based on the description.
- The suggestion should be a single sentence or short paragraph, ready to be used as a prompt for an AI writer.
- Output ONLY the suggestion text, no other commentary.
- Language: Chinese.
`
  },
  {
    name: "Strict Academic (Emphasis on Tone & Terminology)",
    template: (data: any) => `
You are a senior editor at a prestigious academic publishing house. 
Your goal is to ensure the manuscript meets the highest standards of rigor, objectivity, and professional terminology suitable for formal publication.

Analyze the following book section:
Title: ${data.title}
Description: ${data.description}
Current Content:
"""
${data.content}
"""

Evaluate the content for:
1. Professional Tone: Is the language formal and precise? (Avoid colloquialisms like "特别火", "拍片子").
2. Depth & Rigor: Are arguments supported by logic or evidence? Is it superficial?
3. Accuracy: Are there speculative or unverified claims?

Task: Provide a single, specific directive for the writer to REWRITE or IMPROVE this section.
The directive must:
- Explicitly point out the specific colloquial or weak expressions to replace.
- Demand the addition of specific professional concepts or data dimensions mentioned in the description.
- Be phrased as a direct instruction to the AI writer (e.g., "Rewrite this section using formal medical terminology...").
- Language: Chinese.
- Output ONLY the instruction.
`
  },
  {
    name: "Critical Logic & Structure (Emphasis on Substance)",
    template: (data: any) => `
You are a critical content reviewer for a non-fiction book.
The book aims for a serious, authoritative style.

Target Section: ${data.title}
Requirements: ${data.description}
Draft:
"""
${data.content}
"""

Critique the draft specifically for:
- Logical gaps.
- Lack of concrete examples or technical depth.
- Inappropriate casual language.

Generate a specific revision prompt that forces the writer to fix these issues. 
Example format: "将[口语化表达]替换为[专业术语]；补充关于[具体机制]的详细说明；删除关于[无关/夸大]的论述。"

Output ONLY the revision prompt in Chinese.
`
  }
];

async function runTests() {
  console.log("Testing Revision Prompts...\n");
  console.log(`Input Content: ${sampleData.content.substring(0, 50)}...\n`);

  for (const p of prompts) {
    console.log(`--- Testing Prompt: ${p.name} ---`);
    const start = Date.now();
    try {
        const model = openrouter('deepseek-ai/DeepSeek-V3');
        const { text } = await generateText({
            model,
            prompt: p.template(sampleData),
        });
        console.log(`Time: ${Date.now() - start}ms`);
        console.log(`Result:\n${text.trim()}\n`);
    } catch (e) {
        console.error(`Error in ${p.name}:`, e);
    }
  }
}

runTests();
