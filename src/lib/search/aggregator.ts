import { BochaSearchProvider } from './bocha';
import { OneBoundSearchProvider } from './onebound';
import { SearchOptions, SearchResult } from './types';
import * as cheerio from 'cheerio';

export class SearchAggregator {
  private bocha: BochaSearchProvider;
  private onebound: OneBoundSearchProvider;

  constructor() {
    this.bocha = new BochaSearchProvider();
    this.onebound = new OneBoundSearchProvider();
  }

  public async fetchFullContent(url: string): Promise<string> {
    try {
      // Use jina.ai reader for better content extraction
      const response = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Return-Format': 'text'
        },
        next: { revalidate: 3600 }
      });
      
      if (!response.ok) {
        // Fallback to direct fetch if jina fails
        return this.fetchDirectly(url);
      }
      
      const text = await response.text();
      return text.trim();
    } catch (e) {
      console.error(`Failed to fetch full content via jina for ${url}:`, e);
      return this.fetchDirectly(url);
    }
  }

  private async fetchDirectly(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        next: { revalidate: 3600 }
      });
      
      if (!response.ok) return '';
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove noise
      $('script, style, nav, footer, header, ads, .ads, #ads, .cookie-banner').remove();
      
      // Focus on main content areas
      const content = $('article, main, .content, .post-content, #content, .js-content').text() || $('body').text();
      
      // Clean up whitespace
      return content.replace(/\s+/g, ' ').trim();
    } catch (e) {
      console.error(`Failed to fetch full content directly for ${url}:`, e);
      return '';
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // Run searches in parallel
    const [bochaResults, oneboundResults] = await Promise.all([
      this.bocha.search(options),
      this.onebound.search(options),
    ]);

    // Combine and deduplicate
    const allResults = [...bochaResults, ...oneboundResults];
    
    // Simple deduplication by URL
    const seenUrls = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    for (const result of allResults) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        uniqueResults.push(result);
      }
    }

    return uniqueResults;
  }
}

export const searchAggregator = new SearchAggregator();
