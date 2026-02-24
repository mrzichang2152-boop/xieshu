
const fs = require('fs');

try {
  const data = fs.readFileSync('search_test_result_v22.json', 'utf8');
  const json = JSON.parse(data);

  console.log('--- Queries Generated ---');
  console.log(json.queries);

  console.log('\n--- Result Stats ---');
  console.log(`Total Results: ${json.results.length}`);

  let longSnippets = 0;
  let shortSnippets = 0;
  let emptySnippets = 0;
  let jinaSources = 0;

  json.results.forEach((r, i) => {
    const len = r.snippet ? r.snippet.length : 0;
    if (len === 0) emptySnippets++;
    else if (len > 1000) longSnippets++;
    else shortSnippets++;

    // Check if it looks like a Jina extraction (often has specific markdown or just being very long is a proxy)
    // But since I don't store "source_type" explicitly, I'll just rely on length.
  });

  console.log(`Long Snippets (>1000 chars): ${longSnippets}`);
  console.log(`Short Snippets (<=1000 chars): ${shortSnippets}`);
  console.log(`Empty Snippets: ${emptySnippets}`);

  if (longSnippets > 0) {
    console.log('\nSUCCESS: Full content extraction is working for at least some sources.');
  } else {
    console.log('\nWARNING: No long snippets found. Content extraction might be failing.');
  }

} catch (e) {
  console.error('Error analyzing results:', e);
}
