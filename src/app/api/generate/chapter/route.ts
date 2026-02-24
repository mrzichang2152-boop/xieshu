
import { NextResponse } from 'next/server';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { openrouter } from '@/lib/llm';
import { PROMPTS } from '@/lib/prompts';
import { searchAggregator } from '@/lib/search/aggregator';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // Allow 5 minutes for generation

// Helper to perform search, filter with AI, and fetch full content
async function performSearchWithAISelection(
  queries: string[],
  model: any
): Promise<any[]> {
  // 1. Perform initial search with timeout
  const searchPromises = queries.map(q => 
    Promise.race([
      searchAggregator.search({ query: q }),
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 15000)) // 15s timeout per query
    ])
  );
  
  const allResults = await Promise.all(searchPromises);
  let flatResults = allResults.flat();
  
  // Dedup by URL
  const seenUrls = new Set();
  flatResults = flatResults.filter(r => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });

  if (flatResults.length === 0) return [];

  console.log(`[Chapter Search] Found ${flatResults.length} initial results. Performing AI selection...`);

  // 2. AI Selection
  try {
    const { object: selection } = await generateObject({
      model: model,
      schema: z.object({
        indices: z.array(z.number())
      }),
      prompt: PROMPTS.SELECT_SOURCES.replace('{results}', JSON.stringify(flatResults.map((r, i) => ({
        index: i,
        title: r.title,
        snippet: r.snippet,
        source: r.source
      })).slice(0, 50))), // Limit prompt context to top 50
    });

    console.log(`[Chapter Search] AI selected indices: ${JSON.stringify(selection.indices)}`);

    // 3. Fetch Full Content for selected indices
    const fetchPromises = selection.indices.map(async (index) => {
      const result = flatResults[index];
      // Sanity check
      if (!result || !result.url) return result;

      try {
          console.log(`[Chapter Search] Fetching full content for [${index}] ${result.url}...`);
          // Fetch full content
          const fullContent = await searchAggregator.fetchFullContent(result.url);
          console.log(`[Chapter Search] Fetched content length for [${index}]: ${fullContent ? fullContent.length : 0}`);
          
          // If content is substantial, replace snippet
          if (fullContent && fullContent.length > 100) { 
              return { ...result, snippet: fullContent };
          }
      } catch (e) {
          console.error(`Error fetching ${result.url}`, e);
      }
      return result; // Fallback to original
    });

    const fetchedResults = await Promise.all(fetchPromises);
    
    // Update flatResults with enriched content
    for (let i = 0; i < selection.indices.length; i++) {
        const idx = selection.indices[i];
        if (idx < flatResults.length) {
            flatResults[idx] = fetchedResults[i];
        }
    }
    
    // Filter to keep only selected ones (optional, but cleaner context)
    // Actually, let's return ONLY the selected ones to save context window
    const selectedResults = selection.indices.map(idx => flatResults[idx]).filter(Boolean);
    return selectedResults.length > 0 ? selectedResults : flatResults.slice(0, 3); // Fallback to top 3 if selection fails or returns empty

  } catch (e) {
    console.error("AI Selection failed", e);
    // Continue with original results (top 5) if AI fails
    return flatResults.slice(0, 5);
  }
}

export async function POST(req: Request) {
  const { 
    book, 
    part,
    chapter,
    previousContext,
    model, // New parameter
    currentContent,
    revisionPrompt,
    selectedSources // New parameter for revision
  } = await req.json();

  // Use a capable model for chapter generation
  // Default to deepseek-ai/DeepSeek-V3 if not provided
  const selectedModel = openrouter(model || 'deepseek-ai/DeepSeek-V3');

  try {
    // 0. Search Step (New)
    let searchContext = '';
    let finalSearchResults: any[] = []; // To store results for response

    if (revisionPrompt && selectedSources && selectedSources.length > 0) {
       // Revision Mode with User-Selected Sources
       console.log(`[Chapter Gen] Using ${selectedSources.length} user-selected sources for revision.`);
       finalSearchResults = selectedSources;
       searchContext = selectedSources.map((r: any, i: number) => `
[参考文章 ${i+1}]
标题: ${r.title}
来源: ${r.source === 'wechat' ? '微信公众号' : 'Web'}
内容摘要/正文: ${r.snippet}
URL: ${r.url}
`).join('\n\n');

    } else {
       // Normal Search Mode (Initial or Revision without specific selection)
        try {
            console.log(`[Chapter Gen] Generating search keywords for chapter: ${chapter.title}`);
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
            
            console.log(`[Chapter Gen] Keywords: ${keywordData.queries.join(', ')}`);
            
            finalSearchResults = await performSearchWithAISelection(keywordData.queries, selectedModel);
            
            if (finalSearchResults.length > 0) {
                searchContext = finalSearchResults.map((r, i) => `
[参考文章 ${i+1}]
标题: ${r.title}
来源: ${r.source === 'wechat' ? '微信公众号' : 'Web'}
内容摘要/正文: ${r.snippet}
URL: ${r.url}
`).join('\n\n');
            }
        } catch (e) {
            console.error("Search step failed", e);
            // Fallback: proceed without search context
        }
    }

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

    let systemPrompt = '';

    if (revisionPrompt && currentContent) {
      // Revision Mode
      systemPrompt = `你是一位专业书籍作者。你的任务是根据用户的修改意见，对已有的章节正文进行修改和润色。

请遵循以下写作规范：
${writingNorms}

【书籍信息】
书籍标题：${book.title}
书籍写作要求：${book.requirements}

【当前章节信息】
篇标题：${part.title}
篇描述：${part.description}
章标题：${chapter.title}
章描述：${chapter.description}

【上下文（前文内容）】
${previousContext || '这是第一章，暂无前文。'}

【参考资料（已过滤的优质文章，可用于丰富内容）】
${searchContext || '暂无参考资料。'}

【当前正文草稿】
${currentContent}

【修改意见】
${revisionPrompt}

【任务要求】
1. 基于【当前正文草稿】，结合【修改意见】进行修改。
2. 保持与【书籍信息】和【当前章节信息】的一致性。
3. 如果前文有相关概念，请保持术语和逻辑的一致性。
4. 参考【参考资料】中的案例、数据或观点，使内容更详实、有深度（如果适用）。
5. 直接输出修改后的完整正文内容，不要包含"好的，我已修改..."等客套话。
6. 结构清晰，适当使用Markdown标题（##, ###）来组织内容。
`;
    } else {
      // Generation Mode
      systemPrompt = `你是一位专业书籍作者。你的任务是根据已有的大纲和上下文，撰写高质量的章节正文。
请遵循以下写作规范：
${writingNorms}

【书籍信息】
书籍标题：${book.title}
书籍写作要求：${book.requirements}

【当前章节信息】
篇标题：${part.title}
篇描述：${part.description}
章标题：${chapter.title}
章描述：${chapter.description}

【上下文（前文内容）】
${previousContext || '这是第一章，暂无前文。'}

【参考资料（已过滤的优质文章，可用于丰富内容）】
${searchContext || '暂无参考资料。'}

【任务要求】
1. 直接输出正文内容，不要包含"好的，我来写..."等客套话。
2. 内容要详实、深入，符合专业书籍的标准。
3. 严格遵循书籍和章节的写作要求。
4. 充分利用【参考资料】中的案例、数据、观点，确保内容具有实战价值和深度。
5. 如果前文有相关概念，请保持术语和逻辑的一致性。
6. 结构清晰，适当使用Markdown标题（##, ###）来组织内容。
`;
    }

    const { text } = await generateText({
      model: selectedModel,
      prompt: systemPrompt,
      temperature: 0.7,
    });

    return NextResponse.json({ 
      content: text,
      searchResults: finalSearchResults
    });

  } catch (error) {
    console.error('Chapter Generation API Error:', error);
    return NextResponse.json({ error: '章节生成失败', details: String(error) }, { status: 500 });
  }
}
