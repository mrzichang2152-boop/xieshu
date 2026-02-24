import { SearchOptions, SearchProvider, SearchResult } from './types';

const BOCHA_API_URL = 'https://api.bochaai.com/v1/web-search';

export class BochaSearchProvider implements SearchProvider {
  name = 'bocha';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const BOCHA_API_KEY = process.env.BOCHA_API_KEY;
    
    if (!BOCHA_API_KEY) {
      console.warn('BOCHA_API_KEY is not set');
      return [];
    }

    try {
      const response = await fetch(BOCHA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOCHA_API_KEY}`,
        },
        body: JSON.stringify({
          query: options.query,
          freshness: 'noLimit', // or 'oneDay', 'oneWeek', 'oneMonth', 'oneYear'
          summary: true,
          count: options.count || 10,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Bocha API error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Bocha API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Map Bocha response to SearchResult
      // Bocha response format: { data: { webPages: { value: [...] } } }
      const results = data.data?.webPages?.value || data.results || [];

      return results.map((item: any, index: number) => ({
        id: `bocha-${index}`,
        title: item.name || item.title || '',
        url: item.url || item.link || '',
        snippet: item.snippet || item.summary || item.body || '',
        source: 'web',
        publishedAt: item.datePublished || item.date_published,
      }));

    } catch (error) {
      console.error('Bocha search failed:', error);
      return [];
    }
  }
}
