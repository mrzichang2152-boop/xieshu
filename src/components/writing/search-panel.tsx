import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, ExternalLink } from 'lucide-react';
import { SearchResult } from '@/types';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="w-80 border-l bg-muted/10 flex flex-col h-full">
      <div className="p-4 border-b space-y-4">
        <h3 className="font-semibold text-sm uppercase text-muted-foreground">参考资料</h3>
        <div className="flex space-x-2">
          <Input 
            placeholder="搜索全网和公众号..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9"
          />
          <Button size="icon" className="h-9 w-9" onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {results.map((result, idx) => (
            <Card key={idx} className="bg-background overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <a href={result.url} target="_blank" rel="noopener noreferrer" 
                     className="font-medium text-sm hover:underline line-clamp-2 leading-tight">
                    {result.title}
                  </a>
                  <Badge variant={result.source === 'wechat' ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5 shrink-0">
                    {result.source === 'wechat' ? '公众号' : '全网'}
                  </Badge>
                </div>
                
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {result.snippet}
                </p>
                
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                   <span>{result.publish_date ? new Date(result.publish_date).toLocaleDateString() : ''}</span>
                   <a href={result.url} target="_blank" rel="noopener noreferrer">
                     <ExternalLink className="h-3 w-3" />
                   </a>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {results.length === 0 && !loading && (
            <div className="text-center text-sm text-muted-foreground py-10">
              输入关键词以在网络和公众号中搜索参考资料。
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
