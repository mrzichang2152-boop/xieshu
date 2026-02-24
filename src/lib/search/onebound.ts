import { SearchOptions, SearchProvider, SearchResult } from './types';

// Correct endpoint verified
const ONEBOUND_API_URL = 'https://api-gw.onebound.cn/weixin/item_search';

export class OneBoundSearchProvider implements SearchProvider {
  name = 'onebound';

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const ONEBOUND_API_KEY = process.env.ONEBOUND_API_KEY;
    const ONEBOUND_API_SECRET = process.env.ONEBOUND_API_SECRET;

    if (!ONEBOUND_API_KEY) {
      console.warn('ONEBOUND_API_KEY is not set');
      return [];
    }

    try {
      // Construct URL with query parameters
      const url = new URL(ONEBOUND_API_URL);
      url.searchParams.append('key', ONEBOUND_API_KEY);
      if (ONEBOUND_API_SECRET) {
        url.searchParams.append('secret', ONEBOUND_API_SECRET);
      }
      url.searchParams.append('q', options.query);
      url.searchParams.append('page', (options.page || 1).toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
      });

      if (!response.ok) {
        console.error(`OneBound API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();

      // OneBound usually returns { item: [...], error_code: "0000" }
      if (data.error_code && data.error_code !== "0000") {
        console.error('OneBound API returned error:', data.error_code, data.reason);
        return [];
      }

      // Handle nested items structure: { items: { item: [...] } } or { item: [...] }
      let items: any[] = [];
      if (data.items?.item && Array.isArray(data.items.item)) {
        items = data.items.item;
      } else if (data.item && Array.isArray(data.item)) {
        items = data.item;
      } else if (Array.isArray(data.items)) {
        items = data.items;
      }

      return items.map((item: any, index: number) => ({
        id: `onebound-${index}`,
        title: item.title || '',
        url: item.z_url || item.url || item.detail_url || '',
        snippet: item.desc || item.description || item.title || '', // Fallback to title if no snippet
        source: 'wechat',
        publishedAt: item.publish_time || item.publish_date,
      }));

    } catch (error) {
      console.error('OneBound search failed:', error);
      return [];
    }
  }
}
