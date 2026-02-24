import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { openrouter } from '@/lib/llm';
import { PROMPTS } from '@/lib/prompts';
import { searchAggregator } from '@/lib/search/aggregator';

import fs from 'fs';
import path from 'path';

export const maxDuration = 60; // 60 seconds max

// Helper to load writing norms
function getWritingNorms() {
  try {
    const normsPath = path.join(process.cwd(), '写作规范.md');
    if (fs.existsSync(normsPath)) {
      return fs.readFileSync(normsPath, 'utf-8');
    }
  } catch (e) {
    console.error('Failed to load writing norms:', e);
  }
  return 'Follow standard academic and professional writing norms.';
}

const writingNorms = getWritingNorms();

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

  console.log(`[Search] Found ${flatResults.length} initial results. Performing AI selection...`);

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

    console.log(`[Search] AI selected indices: ${JSON.stringify(selection.indices)}`);

    // 3. Fetch Full Content for selected indices
    const fetchPromises = selection.indices.map(async (index) => {
      const result = flatResults[index];
      // Sanity check
      if (!result || !result.url) return result;

      try {
          console.log(`[Search] Fetching full content for [${index}] ${result.url}...`);
          // Fetch full content
          const fullContent = await searchAggregator.fetchFullContent(result.url);
          console.log(`[Search] Fetched content length for [${index}]: ${fullContent ? fullContent.length : 0}`);
          
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
    
  } catch (e) {
    console.error("AI Selection failed", e);
    // Continue with original results if AI fails
  }

  return flatResults;
}

// Helper to format context efficiently
function formatResearchContext(contexts: any[]): string {
  if (!Array.isArray(contexts)) return '';
  
  const allResults = contexts.flatMap(c => c.results || []);
  const seen = new Set();
  const unique = [];
  
  for (const r of allResults) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      unique.push(r);
    }
  }

  // Format as readable text blocks
  return unique.map((r, i) => 
    `[Source ${i+1}]
Title: ${r.title}
Type: ${r.source === 'wechat' ? 'Official Account' : 'Web'}
Snippet: ${r.snippet}
URL: ${r.url}`
  ).join('\n\n').substring(0, 150000); // Increased limit to 150k to leverage large context window
}

export async function POST(req: Request) {
  const { action, data, model } = await req.json();
  const selectedModel = openrouter(model || 'deepseek-ai/DeepSeek-V3');

  try {
    switch (action) {
      case 'generate_keywords': {
        const { userInput } = data;
        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            queries: z.array(z.string()).describe('List of search queries')
          }),
          prompt: PROMPTS.GENERATE_KEYWORDS.replace('{userInput}', userInput),
        });

        // Perform search immediately? 
        // Or return queries and let client search?
        // Let's perform search server-side for efficiency and simpler client.
        const flatResults = await performSearchWithAISelection(object.queries, selectedModel);

        return NextResponse.json({ 
          queries: object.queries, 
          results: flatResults 
        });
      }

      case 'expand_keywords': {
        const { userInput, context } = data; // context is stringified previous results
        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            queries: z.array(z.string()).describe('List of new search queries')
          }),
          prompt: PROMPTS.EXPAND_KEYWORDS
            .replace('{userInput}', userInput)
            .replace('{context}', JSON.stringify(context).substring(0, 5000)), // Limit context
        });

        const flatResults = await performSearchWithAISelection(object.queries, selectedModel);

        return NextResponse.json({ 
          queries: object.queries, 
          results: flatResults 
        });
      }

      case 'check_clarity': {
        const { userInput, context, qaPairs, round } = data;
        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            status: z.enum(['clear', 'ambiguous']),
            questions: z.array(z.object({
              question: z.string(),
              options: z.array(z.string()).optional()
            })).optional()
          }),
          prompt: PROMPTS.CLARIFICATION_CHECK
            .replace('{userInput}', userInput)
            .replace('{qaPairs}', JSON.stringify(qaPairs || []))
            .replace('{context}', JSON.stringify(context).substring(0, 8000))
            .replace('{round}', String(round || 1)),
        });

        return NextResponse.json(object);
      }

      case 'generate_outline': {
        const { userInput, context, qaPairs } = data;
        const writingNorms = getWritingNorms();
        
        // This might take longer, maybe stream?
        // For now, simpler request/response.
        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            title: z.string(),
            target_audience: z.string(),
            core_goal: z.string(),
            parts: z.array(z.object({
              title: z.string(),
              intro: z.string(),
              chapters: z.array(z.object({
                title: z.string(),
                intro: z.string(),
                summary: z.string(),
                sections: z.array(z.object({
                  title: z.string(),
                  type: z.enum(['theory', 'method', 'practice', 'trend']),
                  key_points: z.array(z.string()),
                  search_references: z.array(z.object({
                    title: z.string(),
                    url: z.string(),
                    source: z.string().optional()
                  })).optional().describe('List of search results used as reference for this section')
                })).min(3, { message: "Each chapter must have at least 3 sections" })
              }))
            }))
          }),
          prompt: PROMPTS.GENERATE_OUTLINE
            .replace('{userInput}', userInput)
            .replace('{qaPairs}', JSON.stringify(qaPairs))
            .replace('{context}', formatResearchContext(context))
            .replace('{writingNorms}', writingNorms),
        });

        return NextResponse.json({ outline: object });
      }

      case 'refine_outline': {
        const { currentOutline, refinementInstruction, context } = data;
        const writingNorms = getWritingNorms();

        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            title: z.string(),
            target_audience: z.string(),
            core_goal: z.string(),
            parts: z.array(z.object({
              title: z.string(),
              intro: z.string(),
              chapters: z.array(z.object({
                title: z.string(),
                intro: z.string(),
                summary: z.string(),
                sections: z.array(z.object({
                  title: z.string(),
                  type: z.enum(['theory', 'method', 'practice', 'trend']),
                  key_points: z.array(z.string()),
                  search_references: z.array(z.object({
                    title: z.string(),
                    url: z.string(),
                    source: z.string().optional()
                  })).optional()
                })).min(3, { message: "Each chapter must have at least 3 sections" })
              }))
            }))
          }),
          prompt: PROMPTS.REFINE_OUTLINE
            .replace('{currentOutline}', JSON.stringify(currentOutline))
            .replace('{refinementInstruction}', refinementInstruction)
            .replace('{context}', formatResearchContext(context))
            .replace('{writingNorms}', writingNorms),
        });
        return NextResponse.json(object);
      }

      case 'parse_manual_outline': {
        const { userInput } = data;
        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            title: z.string(),
            target_audience: z.string(),
            core_goal: z.string(),
            parts: z.array(z.object({
              title: z.string(),
              intro: z.string(),
              chapters: z.array(z.object({
                title: z.string(),
                intro: z.string(),
                summary: z.string(),
                sections: z.array(z.object({
                  title: z.string(),
                  type: z.enum(['theory', 'method', 'practice', 'trend']),
                  key_points: z.array(z.string()),
                  search_references: z.array(z.object({
                    title: z.string(),
                    url: z.string(),
                    source: z.string().optional()
                  })).optional()
                }))
              }))
            }))
          }),
          prompt: PROMPTS.PARSE_MANUAL_OUTLINE.replace('{userInput}', userInput),
        });
        return NextResponse.json({ outline: object });
      }

      case 'generate_keywords_from_outline': {
        const { outline } = data;
        
        // Simplify outline to reduce token usage and latency
        // Only keep structure: titles and types
        const simplifiedOutline = {
          title: outline.title,
          target_audience: outline.target_audience,
          core_goal: outline.core_goal,
          parts: outline.parts.map((p: any) => ({
            title: p.title,
            chapters: p.chapters.map((c: any) => ({
              title: c.title,
              sections: c.sections.map((s: any) => ({
                title: s.title,
                type: s.type
              }))
            }))
          }))
        };

        const { object } = await generateObject({
          model: selectedModel,
          schema: z.object({
            queries: z.array(z.string()).describe('List of search queries based on outline gaps')
          }),
          prompt: PROMPTS.GENERATE_KEYWORDS_FROM_OUTLINE.replace('{outline}', JSON.stringify(simplifiedOutline)),
        });

        // Perform search with timeout protection
        const flatResults = await performSearchWithAISelection(object.queries, selectedModel);

        return NextResponse.json({ 
          queries: object.queries, 
          results: flatResults 
        });
      }

      case 'perform_search': {
        const { queries } = data;
        const results = await performSearchWithAISelection(queries, selectedModel);
        return NextResponse.json({ results });
      }

      default:
        return NextResponse.json({ error: '无效的操作' }, { status: 400 });
    }
  } catch (error) {
    console.error('Wizard API Error:', error);
    return NextResponse.json({ error: '处理失败', details: String(error) }, { status: 500 });
  }
}
