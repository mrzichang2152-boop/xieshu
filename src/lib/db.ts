// src/lib/db.ts

import Dexie, { Table } from 'dexie';
import { BookOutline, BookChapter, BookSection, SearchResult } from '@/types';

class AIWriterDB extends Dexie {
  books!: Table<BookOutline, string>; // id is primary key
  chapters!: Table<BookChapter, string>;
  sections!: Table<BookSection, string>;
  search_cache!: Table<SearchResult & { query: string; timestamp: number; id?: string }, string>;

  constructor() {
    super('AIWriterDB');
    this.version(2).stores({
      books: 'id, title, created_at',
      chapters: 'id, book_id, status, order', // 索引 book_id 以便快速查询某书章节
      sections: 'id, chapter_id, type, order',
      search_cache: '++id, query, timestamp, [query+source]' // 简单的缓存机制
    });
  }
}

export const db = new AIWriterDB();
