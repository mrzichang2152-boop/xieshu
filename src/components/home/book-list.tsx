'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { BookOutline } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen, Trash2, Wand2, PenTool } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function BookList() {
  const [books, setBooks] = useState<BookOutline[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      const allBooks = await db.books.toArray();
      // Sort by created_at desc
      allBooks.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setBooks(allBooks);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation();
    if (confirm('确定要删除这本书吗？此操作无法撤销。')) {
        try {
            await db.books.delete(id);
            // Cascade delete chapters and sections
            const chapters = await db.chapters.where('book_id').equals(id).toArray();
            const chapterIds = chapters.map(c => c.id);
            if (chapterIds.length > 0) {
                await db.chapters.where('book_id').equals(id).delete();
                await db.sections.where('chapter_id').anyOf(chapterIds).delete();
            }
            
            loadBooks();
        } catch(err) {
            console.error("Delete failed", err);
        }
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">正在加载书籍列表...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">我的书籍</h2>
        <Link href="/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新建书籍
          </Button>
        </Link>
      </div>

      {books.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="p-4 rounded-full bg-muted/50">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-lg">还没有创建任何书籍</h3>
              <p className="text-muted-foreground text-sm">
                开始你的第一次写作之旅吧。
              </p>
            </div>
            <Link href="/create">
              <Button variant="default">
                <Plus className="mr-2 h-4 w-4" />
                开始创作
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => {
            // Determine the link based on task type
            const href = book.task_type === 'manual_outline' 
              ? `/create/manual/${book.id}` 
              : `/write/${book.id}`;

            return (
            <Link key={book.id} href={href} className="block group">
              <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">
                        {book.title}
                    </CardTitle>
                    {book.task_type === 'manual_outline' ? (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                            <PenTool className="h-3 w-3 mr-1" />
                            生成书
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="shrink-0 text-xs bg-primary/5">
                            <Wand2 className="h-3 w-3 mr-1" />
                            大纲
                        </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[40px]">
                    {book.core_goal || "暂无描述"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>目标读者: {book.target_audience || "未设定"}</p>
                    <p>创建时间: {new Date(book.created_at || Date.now()).toLocaleDateString()}</p>
                  </div>
                </CardContent>
                <CardFooter className="pt-2 flex justify-end border-t bg-muted/5">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(e, book.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </CardFooter>
              </Card>
            </Link>
          )})}
        </div>
      )}
    </div>
  );
}
