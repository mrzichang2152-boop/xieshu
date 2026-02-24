import { generateObject } from 'ai';
import { z } from 'zod';
import { PROMPTS } from '@/lib/prompts';
import { searchAggregator } from '@/lib/search/aggregator';
import { SearchResult } from '@/types';

// Helper to perform search, filter with AI, and fetch full content
export async function performSearchWithAISelection(
  queries: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any
): Promise<SearchResult[]> {
  // 1. Perform initial search with timeout
  const searchPromises = queries.map(q => 
    Promise.race([
      searchAggregator.search({ query: q }),
      new Promise<SearchResult[]>((resolve) => setTimeout(() => resolve([]), 15000)) // 15s timeout per query
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
