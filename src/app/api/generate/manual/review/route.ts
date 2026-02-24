import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openrouter } from '@/lib/llm';
import { SearchResult } from '@/types';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { title, description, content, book, chapter, searchResults, model: modelId } = await req.json();

    if (!title && !content) {
      return NextResponse.json({ error: 'Missing title or content' }, { status: 400 });
    }

    const model = openrouter(modelId || 'deepseek-ai/DeepSeek-V3');

    // Format search results context
    const searchContext = searchResults && searchResults.length > 0
      ? searchResults.map((r: SearchResult, i: number) => `
[Ref ${i+1}] Title: ${r.title}
Snippet: ${r.snippet}
`).join('\n')
      : 'No specific search results provided.';

    const prompt = `
You are a senior editor at a prestigious academic publishing house. 
Your goal is to ensure the manuscript meets the highest standards of rigor, objectivity, and professional terminology suitable for formal publication.

**Context:**
- **Book Title**: ${book?.title || 'Unknown'}
- **Book Requirements**: ${book?.requirements || 'N/A'}
- **Chapter**: ${chapter?.title || 'Unknown'} (${chapter?.description || ''})

**Target Section:**
- **Section Title**: ${title}
- **Section Requirements**: ${description || 'N/A'}

**Reference Materials (Search Results):**
${searchContext}

**Current Content:**
"""
${content || '(No content yet)'}
"""

**Task:**
Provide a single, specific, and actionable revision suggestion.

**Guidelines:**
1. **Holistic Consistency**: Ensure the content aligns with the **Book Requirements** and **Chapter Theme**.
2. **Evidence-Based**: If the content lacks depth, explicitly instruct the writer to incorporate details from the **Reference Materials** (e.g., "Cite the data from Ref 1...").
3. **Tone & Style**: Enforce a strict academic/formal tone. Flag colloquialisms or vague statements.
4. **Actionable**: Give direct instructions (e.g., "Replace 'X' with 'Y'", "Expand on Z using Ref 2").

**Output Format:**
- A single paragraph of direct instructions to the writer.
- **Language: Chinese**.
- Output ONLY the suggestion text.
`;

    const { text } = await generateText({
      model,
      prompt,
    });

    return NextResponse.json({ suggestion: text.trim() });
  } catch (error) {
    console.error('Error generating suggestion:', error);
    return NextResponse.json({ error: 'Failed to generate suggestion' }, { status: 500 });
  }
}
