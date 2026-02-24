
const fs = require('fs');

try {
  const data = fs.readFileSync('search_test_result_v23.json', 'utf8');
  const json = JSON.parse(data);

  console.log('--- Result Analysis by Source (v23) ---');
  
  const stats = {
    bocha: { total: 0, long: 0, short: 0, domains: new Set() },
    onebound: { total: 0, long: 0, short: 0, domains: new Set() },
    other: { total: 0, long: 0, short: 0, domains: new Set() }
  };

  json.results.forEach(r => {
    let type = 'other';
    if (r.id && r.id.startsWith('bocha')) type = 'bocha';
    else if (r.id && r.id.startsWith('onebound')) type = 'onebound';
    
    stats[type].total++;
    
    const len = r.snippet ? r.snippet.length : 0;
    if (len > 1000) stats[type].long++;
    else stats[type].short++;

    try {
        const domain = new URL(r.url).hostname;
        stats[type].domains.add(domain);
    } catch (e) {}
  });

  console.log('Bocha:', { 
    ...stats.bocha, 
    domains: stats.bocha.domains.size 
  });
  console.log('OneBound:', { 
    ...stats.onebound, 
    domains: stats.onebound.domains.size 
  });
  console.log('Other:', stats.other);

  if (stats.onebound.total > 0) {
      console.log('\nSample OneBound URLs:', json.results.filter(r => r.id.startsWith('onebound')).slice(0, 3).map(r => r.url));
      
      // Check content of a long OneBound result
      const longOneBound = json.results.find(r => r.id.startsWith('onebound') && r.snippet.length > 1000);
      if (longOneBound) {
          console.log('\nSUCCESS: Found long OneBound content!');
          console.log('Snippet start:', longOneBound.snippet.substring(0, 200));
      } else {
          console.log('\nWARNING: No long OneBound content found yet.');
      }
  }

} catch (e) {
  console.error('Error analyzing results:', e);
}
