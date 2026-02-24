'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useBookStore } from '@/store/use-book-store';
import { WritingSidebar } from '@/components/writing/sidebar';
import { WritingEditor } from '@/components/writing/editor';
import { SearchPanel } from '@/components/writing/search-panel';
import { Loader2 } from 'lucide-react';

export default function WritingPage() {
  const params = useParams();
  const id = params?.id as string;
  const { loadBook, currentBook, isLoading } = useBookStore();

  useEffect(() => {
    if (id) {
      loadBook(id);
    }
  }, [id, loadBook]);

  if (isLoading || !currentBook) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2">正在加载书籍工作区...</span>
    </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <WritingSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <WritingEditor />
      </main>
      <SearchPanel />
    </div>
  );
}
