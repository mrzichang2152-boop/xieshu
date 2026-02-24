
import { NextResponse } from 'next/server';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { openrouter } from '@/lib/llm';
import { PROMPTS } from '@/lib/prompts';
import { performSearchWithAISelection } from '@/lib/search/workflow';
import { SearchResult } from '@/types';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; 

export async function POST(req: Request) {
  const { 
    section, 
    chapter, 
    book, 
    prompt, 
    previousContent, 
    model 
  } = await req.json();

  const selectedModel = openrouter(model || 'deepseek-ai/DeepSeek-V3');

  try {
    // Read Writing Norms
    let writingNorms = '';
    try {
      const normsPath = path.join(process.cwd(), '写作规范.md');
      if (fs.existsSync(normsPath)) {
        writingNorms = fs.readFileSync(normsPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Failed to read writing norms', e);
    }

    // 1. Check if search is needed
    // We can do a quick check with a small model or the same model
    // to decide if we need external info based on the prompt and section info.
    // Or we just generate keywords and search if the model thinks so.
    
    // Let's ask the model to generate search queries if needed, or return empty array.
    const { object: searchDecision } = await generateObject({
      model: selectedModel,
      schema: z.object({
        needsSearch: z.boolean(),
        queries: z.array(z.string()).optional()
      }),
      prompt: `
        Analyze if I need to search the web to write this section.
        Section: ${section.title} (${section.type})
        Key Points: ${(section.key_points || []).join(', ')}
        User Prompt: ${prompt}
        
        Return true for needsSearch if I need specific facts, data, or recent info.
        If yes, provide 1-3 queries.
      `
    });

    let searchContext = '';
    if (searchDecision.needsSearch && searchDecision.queries && searchDecision.queries.length > 0) {
      // Perform search using the robust workflow (Parallel Search + AI Selection + Full Content Fetching)
      console.log(`[Write API] Searching for: ${searchDecision.queries.join(', ')}`);
      const searchResults = await performSearchWithAISelection(searchDecision.queries, selectedModel);
      
      searchContext = searchResults.map((r: SearchResult, i: number) => `
[参考文章 ${i+1}]
标题: ${r.title}
来源: ${r.source === 'wechat' ? '微信公众号' : 'Web'}
内容摘要/正文: ${r.snippet}
URL: ${r.url}
`).join('\n\n');
    }

    // 2. Generate Content
    const { text } = await generateText({
      model: selectedModel,
      prompt: PROMPTS.WRITE_SECTION
        .replace('{bookTitle}', book.title)
        .replace('{chapterTitle}', chapter.title)
        .replace('{sectionTitle}', section.title)
        .replace('{sectionType}', section.type)
        .replace('{keyPoints}', (section.key_points || []).join(', '))
        .replace('{userPrompt}', prompt || 'Write this section following the guidelines.')
        .replace('{writingNorms}', writingNorms || 'No specific norms provided.')
        .replace('{previousContent}', previousContent || 'No previous content.')
        .replace('{searchContext}', searchContext || 'No external research used.')
    });

    return NextResponse.json({ 
      content: text,
      searchUsed: searchDecision.needsSearch,
      searchResults: searchContext ? searchDecision.queries : [] 
    });

  } catch (error) {
    console.error('Write API Error:', error);
    return NextResponse.json({ error: '写作生成失败', details: String(error) }, { status: 500 });
  }
}
