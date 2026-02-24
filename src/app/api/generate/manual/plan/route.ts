import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { openrouter } from '@/lib/llm';
import { performSearchWithAISelection } from '@/lib/search/workflow';

export const maxDuration = 300;

export async function POST(req: Request) {
  const { 
    book, 
    // part, // Unused
    chapter,
    model 
  } = await req.json();

  const selectedModel = openrouter(model || 'deepseek-ai/DeepSeek-V3');

  try {
    // 1. Generate Search Keywords
    console.log(`[Plan] Generating search keywords for chapter: ${chapter.title}`);
    const { object: keywordData } = await generateObject({
      model: selectedModel,
      schema: z.object({
        queries: z.array(z.string())
      }),
      prompt: `
        You are an expert researcher helper.
        Generate 3-5 specific search queries to gather detailed information, case studies, and examples for writing the following book chapter.
        
        Book Title: ${book.title}
        Chapter Title: ${chapter.title}
        Chapter Description: ${chapter.description}
        
        Queries should be in Chinese if the book is in Chinese.
        Focus on finding "high quality articles", "in-depth analysis", "real world examples".
      `
    });

    // 2. Perform Search & Fetch Content
    console.log(`[Plan] Keywords: ${keywordData.queries.join(', ')}`);
    const searchResults = await performSearchWithAISelection(keywordData.queries, selectedModel);

    // 3. Generate Section Structure
    console.log(`[Plan] Generating section structure...`);
    
    // Construct Search Context for the Structure Generator
    const searchContext = searchResults.map((r, i) => `
[参考资料 ${i+1}]
标题: ${r.title}
摘要: ${r.snippet.slice(0, 500)}...
`).join('\n\n');

    const { object: structureData } = await generateObject({
      model: selectedModel,
      schema: z.object({
        sections: z.array(z.object({
          title: z.string().describe("Section title"),
          description: z.string().describe("Brief description of what this section should cover"),
          key_points: z.array(z.string()).describe("Key points to be included in this section")
        }))
      }),
      prompt: `
        You are a professional book editor.
        Based on the book info, chapter info, and gathered research materials, design a detailed section structure for this chapter.
        
        Book: ${book.title}
        Chapter: ${chapter.title}
        Chapter Description: ${chapter.description}
        
        Research Context:
        ${searchContext}
        
        Requirements:
        1. Break down the chapter into 3-7 logical sections.
        2. Ensure a logical flow (e.g., Intro -> Concept -> Method/Case -> Summary).
        3. Use professional and engaging titles.
        4. Provide a brief description for each section to guide the writer.
        5. Extract key points from the research materials where applicable.
        
        Output JSON only.
      `
    });

    return NextResponse.json({
      searchResults,
      sections: structureData.sections
    });

  } catch (error) {
    console.error('Plan Generation API Error:', error);
    return NextResponse.json({ error: '生成大纲计划失败', details: String(error) }, { status: 500 });
  }
}
