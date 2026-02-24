import dotenv from 'dotenv';
import path from 'path';
import { SearchAggregator } from '../src/lib/search/aggregator';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  console.log('Initializing SearchAggregator...');
  const aggregator = new SearchAggregator();

  console.log('\n--- Testing Search Aggregator (Bocha + OneBound) ---');
  
  try {
    const results = await aggregator.search({
      query: 'AI Book Writing',
      count: 2
    });

    console.log(`✅ Search completed. Found ${results.length} results.`);
    
    // Group by source
    const bySource: Record<string, number> = {};
    results.forEach(r => {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    });
    console.log('Results by source:', bySource);

    // Print samples
    console.log('\n--- Sample Results ---');
    results.slice(0, 3).forEach((r, i) => {
      console.log(`\n[${i + 1}] [${r.source}] ${r.title}`);
      console.log(`    URL: ${r.url}`);
      console.log(`    Snippet: ${r.snippet.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error('❌ Search Aggregator failed:', error);
  }
}

run();
