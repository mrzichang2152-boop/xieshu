
import { NextResponse } from 'next/server';
import { searchAggregator } from '@/lib/search/aggregator';

export async function GET() {
  try {
    console.log('Starting connectivity test...');
    
    // Test Query
    const query = '人工智能发展趋势';
    
    console.log(`Testing search with query: "${query}"`);
    
    const results = await searchAggregator.search({ query });
    
    const bochaResults = results.filter(r => r.source === 'web');
    const oneboundResults = results.filter(r => r.source === 'wechat');
    
    return NextResponse.json({
      status: 'success',
      summary: {
        total: results.length,
        bocha: bochaResults.length,
        onebound: oneboundResults.length
      },
      results: results.slice(0, 4) // Show first 4 results
    });
  } catch (error) {
    console.error('Connectivity Test Failed:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: String(error) 
    }, { status: 500 });
  }
}
