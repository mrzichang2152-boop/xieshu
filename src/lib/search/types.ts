export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: 'web' | 'wechat';
  score?: number;
  publishedAt?: string;
}

export interface SearchOptions {
  query: string;
  count?: number;
  page?: number;
}

export interface SearchProvider {
  search(options: SearchOptions): Promise<SearchResult[]>;
  name: string;
}
