'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Save, ChevronDown, ChevronRight, BookOpen, ArrowLeft, Sparkles, ExternalLink, Wand2, Files, Copy } from "lucide-react";
import Link from "next/link";
import { useWizardStore } from '@/store/use-wizard-store';
import { BookOutline, BookPart, BookChapter, BookSection } from '@/types';
import { db } from '@/lib/db';
import { SearchResult } from '@/lib/search/types';

// Helper to generate IDs
const generateId = () => crypto.randomUUID();

export default function ManualEditPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.bookId as string;
  const { setGeneratedOutline } = useWizardStore();
  
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [parts, setParts] = useState<BookPart[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingChapters, setGeneratingChapters] = useState<Record<string, boolean>>({}); // Track generation status per chapter
  const [generatingSections, setGeneratingSections] = useState<Record<string, boolean>>({}); // Track generation status per section
  const [generatingSuggestions, setGeneratingSuggestions] = useState<Record<string, boolean>>({}); // Track suggestion generation status per section
  const [reviewModel, setReviewModel] = useState<string>('openai/gpt-4o');
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-pro-preview'); // Default model
  const [revisionPrompts, setRevisionPrompts] = useState<Record<string, string>>({}); // Modification suggestions per chapter
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({}); // Default expanded, so track collapsed state
  const [chapterSearchResults, setChapterSearchResults] = useState<Record<string, SearchResult[]>>({});
  const [chapterSelectedSources, setChapterSelectedSources] = useState<Record<string, string[]>>({}); // URL strings
  const [mergedChapterContent, setMergedChapterContent] = useState<Record<string, string>>({}); // Merged content per chapter

  const availableModels = [
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
    { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1 (Reasoning)' },
    { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
    { value: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen 2.5 Coder 32B' },
  ];

  useEffect(() => {
    const loadBookData = async () => {
      try {
        setLoading(true);
        const book = await db.books.get(bookId);
        if (!book) {
          alert("书籍不存在");
          router.push('/');
          return;
        }

        setTitle(book.title);
        setRequirements(book.requirements || book.core_goal || '');

        // Reconstruct parts structure
        // We need to fetch chapters and sections associated with this book
        // Note: In the manual create page save logic, we stored:
        // - Book info in 'books'
        // - Chapters in 'chapters' (flat list)
        // - Sections in 'sections' (flat list)
        // However, the 'parts' structure was also stored inside the book object (book.parts).
        // We can try to use book.parts first as it preserves hierarchy.
        // But we need to make sure we also have the latest content (sections).

        // Let's rely on db.chapters and db.sections for the most up-to-date content if possible,
        // OR if we trust book.parts is updated on save (which it is in our handleSave logic).
        
        // Let's reload everything from normalized tables to be safe and consistent.
        // Actually, our handleSave logic updates both the book object AND the normalized tables.
        // Let's use the normalized tables to reconstruct to ensure we get any edits made elsewhere if any.
        
        // 1. Get all chapters for this book
        const chapters = await db.chapters.where('book_id').equals(bookId).toArray();
        
        // 2. Get all sections for these chapters
        const chapterIds = chapters.map(c => c.id);
        const sections = await db.sections.where('chapter_id').anyOf(chapterIds).toArray();

        // 3. Reconstruct parts
        // Wait, the 'part' concept is only in the JSON structure inside book.parts. 
        // The 'chapters' table doesn't have a 'part_id' field in our current schema (based on types/index.ts).
        // Let's check types.
        // BookChapter has 'id', 'book_id', etc. but no 'part_id'.
        // So we MUST rely on book.parts to get the structure (Parts -> Chapters).
        // Then we fill in the latest chapter/section data into that structure.

        if (book.parts && Array.isArray(book.parts)) {
          const reconstructedParts = book.parts.map(part => ({
            ...part,
            chapters: part.chapters.map(chapStruct => {
              // Find the latest chapter data from DB
              let dbChapter = chapters.find(c => c.id === chapStruct.id);
              if (dbChapter) {
                  // Robust Merge: If dbChapter is missing description/intro/summary, recover from chapStruct
                  // This fixes potential data loss if db.chapters somehow didn't save the description but book.parts did
                  if (!dbChapter.description && chapStruct.description) {
                      dbChapter = { ...dbChapter, description: chapStruct.description };
                  }
                  if (!dbChapter.intro && chapStruct.intro) {
                      dbChapter = { ...dbChapter, intro: chapStruct.intro };
                  }
                  if (!dbChapter.summary && chapStruct.summary) {
                      dbChapter = { ...dbChapter, summary: chapStruct.summary };
                  }
              } else {
                  dbChapter = chapStruct;
              }
              
              // Find sections for this chapter
              const dbSections = sections.filter(s => s.chapter_id === dbChapter.id);
              
              let finalSections = dbSections.length > 0 ? dbSections : (chapStruct.sections || []);

              // Robust Merge: If dbSections is used but missing description, try to recover from chapStruct
              // This fixes potential data loss if db.sections somehow didn't save the description but book.parts did
              if (dbSections.length > 0 && chapStruct.sections) {
                finalSections = finalSections.map(s => {
                    const backup = chapStruct.sections.find((bs: BookSection) => bs.id === s.id);
                    if (backup && !s.description && backup.description) {
                        return { ...s, description: backup.description };
                    }
                    return s;
                });
              }

              return {
                ...dbChapter,
                sections: finalSections
              };
            })
          }));
          setParts(reconstructedParts);
          
          // Auto expand parts
          const newExpandedParts: Record<string, boolean> = {};
          reconstructedParts.forEach(p => newExpandedParts[p.id] = true);
          setExpandedParts(newExpandedParts);
        } else {
          // Fallback if no parts structure (shouldn't happen for manual outline)
          setParts([]);
        }

      } catch (error) {
        console.error("Failed to load book:", error);
        alert("加载书籍失败");
      } finally {
        setLoading(false);
      }
    };

    if (bookId) {
      loadBookData();
    }
  }, [bookId, router]);

  const togglePart = (id: string) => {
    setExpandedParts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const addPart = () => {
    const newPart: BookPart = {
      id: generateId(),
      title: '',
      intro: '',
      description: '',
      chapters: []
    };
    setParts([...parts, newPart]);
    setExpandedParts(prev => ({ ...prev, [newPart.id]: true }));
  };

  const updatePart = (id: string, field: keyof BookPart, value: string) => {
    setParts(parts.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePart = (id: string) => {
    setParts(parts.filter(p => p.id !== id));
  };

  const addChapter = (partId: string) => {
    const newChapter: BookChapter = {
      id: generateId(),
      book_id: bookId, 
      title: '',
      intro: '',
      description: '',
      summary: '',
      sections: [],
      status: 'pending'
    };
    
    setParts(parts.map(p => {
      if (p.id === partId) {
        return { ...p, chapters: [...p.chapters, newChapter] };
      }
      return p;
    }));
    setExpandedChapters(prev => ({ ...prev, [newChapter.id]: true }));
  };

  const updateChapter = (partId: string, chapterId: string, field: keyof BookChapter, value: string) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        return {
          ...p,
          chapters: p.chapters.map(c => c.id === chapterId ? { ...c, [field]: value } : c)
        };
      }
      return p;
    }));
  };

  const removeChapter = (partId: string, chapterId: string) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        return { ...p, chapters: p.chapters.filter(c => c.id !== chapterId) };
      }
      return p;
    }));
  };

  const addSection = (partId: string, chapterId: string, content: string = '') => {
    const newSection: BookSection = {
      id: generateId(),
      chapter_id: chapterId,
      title: '正文', // Default title for auto-generated content
      type: 'theory',
      key_points: [],
      content: content
    };

    setParts(parts.map(p => {
      if (p.id === partId) {
        return {
          ...p,
          chapters: p.chapters.map(c => {
            if (c.id === chapterId) {
              return { ...c, sections: [...c.sections, newSection] };
            }
            return c;
          })
        };
      }
      return p;
    }));
  };

  const updateSection = (partId: string, chapterId: string, sectionId: string, field: keyof BookSection, value: string) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        return {
          ...p,
          chapters: p.chapters.map(c => {
            if (c.id === chapterId) {
              return {
                ...c,
                sections: c.sections.map(s => s.id === sectionId ? { ...s, [field]: value } : s)
              };
            }
            return c;
          })
        };
      }
      return p;
    }));
  };

  const handleGenerateSectionContent = async (partIndex: number, chapterIndex: number, sectionIndex: number) => {
    const part = parts[partIndex];
    const chapter = part.chapters[chapterIndex];
    const section = chapter.sections[sectionIndex];

    if (!section.description?.trim()) {
      alert("请先生成或填写节描述");
      return;
    }

    setGeneratingSections(prev => ({ ...prev, [section.id]: true }));

    try {
      // 1. Collect context from previous chapters (Global Context)
      const previousContentParts: string[] = [];
      for (let p = 0; p <= partIndex; p++) {
        const currentPart = parts[p];
        const limitC = p === partIndex ? chapterIndex : currentPart.chapters.length;
        
        for (let c = 0; c < limitC; c++) {
          const prevChap = currentPart.chapters[c];
          const chapContent = prevChap.sections.map(s => s.content || '').join('\n');
          if (chapContent.trim()) {
            previousContentParts.push(`Chapter: ${prevChap.title}\nContent:\n${chapContent}`);
          }
        }
      }
      const globalPreviousContext = previousContentParts.join('\n\n');

      // 2. Collect context from previous sections in current chapter
      const previousSectionsContent = chapter.sections
        .slice(0, sectionIndex)
        .map(s => s.content || '')
        .join('\n');

      const fullContext = `${globalPreviousContext}\n\n[Current Chapter Context]\n${previousSectionsContent}`;

      const writeResponse = await fetch('/api/generate/manual/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: { title, requirements },
          part: { title: part.title, description: part.description },
          chapter: { title: chapter.title, description: chapter.description },
          section: section,
          revisionPrompt: revisionPrompts[section.id],
          searchResults: chapterSearchResults[chapter.id],
          previousContext: fullContext,
          model: selectedModel
        })
      });

      const writeData = await writeResponse.json().catch(() => null);

      if (!writeResponse.ok) {
        const serverMessage =
          (writeData && (writeData.error || writeData.details)) ||
          `HTTP ${writeResponse.status} ${writeResponse.statusText}`;
        throw new Error(`Failed to generate: ${serverMessage}`);
      }

      const generatedContent = writeData?.content;

      // Update UI
      setParts(prevParts => prevParts.map((p, pIdx) => {
        if (pIdx !== partIndex) return p;
        return {
          ...p,
          chapters: p.chapters.map((c, cIdx) => {
            if (cIdx !== chapterIndex) return c;
            return {
              ...c,
              sections: c.sections.map((s, sIdx) => sIdx === sectionIndex ? { ...s, content: generatedContent } : s)
            };
          })
        };
      }));

    } catch (error: unknown) {
      console.error("Failed to generate section content:", error);
      alert(`生成正文失败: ${(error as Error).message || "请重试"}`);
    } finally {
      setGeneratingSections(prev => ({ ...prev, [section.id]: false }));
    }
  };

  const handleGenerateSuggestion = async (partIndex: number, chapterIndex: number, section: BookSection) => {
    const part = parts[partIndex];
    const chapter = part.chapters[chapterIndex];

    setGeneratingSuggestions(prev => ({ ...prev, [section.id]: true }));
    try {
      const res = await fetch('/api/generate/manual/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: section.title,
          description: section.description,
          content: section.content,
          book: { title, requirements },
          chapter: { title: chapter.title, description: chapter.description },
          searchResults: chapterSearchResults[chapter.id],
          model: reviewModel
        })
      });
      const data = await res.json();
      if (data.suggestion) {
        setRevisionPrompts(prev => ({ ...prev, [section.id]: data.suggestion }));
      }
    } catch (error) {
      console.error('Failed to generate suggestion', error);
    } finally {
      setGeneratingSuggestions(prev => ({ ...prev, [section.id]: false }));
    }
  };

  const handleMergeChapterContent = (partIndex: number, chapterIndex: number) => {
    const part = parts[partIndex];
    const chapter = part.chapters[chapterIndex];

    if (chapter.sections.length === 0) {
      alert("本章没有小节，无法合并。");
      return;
    }

    // Check if all sections have content
    const incompleteSections = chapter.sections.filter(s => !s.content || !s.content.trim());
    
    if (incompleteSections.length > 0) {
      alert(`本章还有 ${incompleteSections.length} 个小节未生成正文，无法合并。请先生成所有小节的正文。`);
      return;
    }

    // Merge content
    const merged = chapter.sections.map((s, idx) => `### ${s.title}\n\n${s.content}`).join('\n\n');
    setMergedChapterContent(prev => ({ ...prev, [chapter.id]: merged }));
    alert("合并完成，已在下方显示。");
  };

  const handleGenerateChapterContent = async (partIndex: number, chapterIndex: number) => {
    const part = parts[partIndex];
    const chapter = part.chapters[chapterIndex];

    // Basic Validation
    if (!title.trim() || !requirements.trim() || !part.title.trim() || !part.description?.trim() || !chapter.title.trim() || !chapter.description?.trim()) {
      alert("请填写完整的书籍信息、篇信息和章信息（包括标题和描述）后再生成正文。");
      return;
    }

    setGeneratingChapters(prev => ({ ...prev, [chapter.id]: true }));

    try {
      // Step 1: PLAN - Generate Structure & Search
      
      const planResponse = await fetch('/api/generate/manual/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: { title, requirements },
          part: { title: part.title, description: part.description },
          chapter: { title: chapter.title, description: chapter.description },
          model: selectedModel
        })
      });

      if (!planResponse.ok) throw new Error("Failed to generate chapter plan");
      
      const planData = await planResponse.json();
      const { searchResults, sections: plannedSections } = planData;

      // Update Search Results UI
      if (searchResults && Array.isArray(searchResults)) {
          setChapterSearchResults(prev => ({ ...prev, [chapter.id]: searchResults }));
          setChapterSelectedSources(prev => ({ 
              ...prev, 
              [chapter.id]: searchResults.map((r: SearchResult) => r.url) 
          }));
      }

      // Convert planned sections to BookSection objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newSections: BookSection[] = plannedSections.map((s: any) => ({
        id: generateId(),
        chapter_id: chapter.id,
        title: s.title,
        description: s.description || '', // Added description
        type: 'theory', // Default type
        key_points: s.key_points || [],
        content: '' // Empty initially
      }));

      // Update UI with new sections (Replace existing)
      setParts(prevParts => prevParts.map((p, pIdx) => {
        if (pIdx !== partIndex) return p;
        return {
          ...p,
          chapters: p.chapters.map((c, cIdx) => {
            if (cIdx !== chapterIndex) return c;
            return { ...c, sections: newSections };
          })
        };
      }));

      // Set new sections to collapsed by default
      setCollapsedSections(prev => {
        const newState = { ...prev };
        newSections.forEach(s => {
          newState[s.id] = true;
        });
        return newState;
      });

    } catch (error: unknown) {
      console.error("Failed to generate chapter structure:", error);
      alert(`生成大纲失败: ${(error as Error).message || "请重试"}`);
    } finally {
      setGeneratingChapters(prev => ({ ...prev, [chapter.id]: false }));
    }
  };


  const removeSection = (partId: string, chapterId: string, sectionId: string) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        return {
          ...p,
          chapters: p.chapters.map(c => {
            if (c.id === chapterId) {
              return { ...c, sections: c.sections.filter(s => s.id !== sectionId) };
            }
            return c;
          })
        };
      }
      return p;
    }));
  };

  const handleSave = async (shouldNavigate: boolean) => {
    if (!title.trim()) {
      alert("请输入书名");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = Date.now();

      // Construct final outline with IDs populated
      const finalParts = parts.map(p => ({
        ...p,
        chapters: p.chapters.map(c => ({
          ...c,
          book_id: bookId,
          sections: c.sections.map(s => ({
            ...s,
            chapter_id: c.id
          }))
        }))
      }));

      const bookOutline: BookOutline = {
        id: bookId,
        title,
        target_audience: 'General',
        core_goal: requirements,
        requirements: requirements,
        parts: finalParts,
        created_at: now, // Ideally we keep original created_at but updating it acts as 'last modified'
        task_type: 'manual_outline'
      };

      // Save to store
      setGeneratedOutline(bookOutline);

      // Prepare data for batch insert
      const chaptersToSave: BookChapter[] = [];
      const sectionsToSave: BookSection[] = [];

      for (const part of parts) {
        for (const chapter of part.chapters) {
          chaptersToSave.push({
            ...chapter,
            book_id: bookId,
            sections: [], // Sections are stored in sections table
            status: chapter.status || 'pending'
          });

          for (const section of chapter.sections) {
            sectionsToSave.push({
              ...section,
              chapter_id: chapter.id,
              content: section.content || '',
              key_points: section.key_points || []
            });
          }
        }
      }

      // Save to DB (Transaction to ensure consistency)
      await db.transaction('rw', db.books, db.chapters, db.sections, async () => {
         // Upsert Book
         await db.books.put(bookOutline);

         // Clean up old chapters/sections for this book to ensure consistency
         // We delete ALL chapters for this book and re-insert current state.
         const existingChapters = await db.chapters.where('book_id').equals(bookId).toArray();
         const existingChapterIds = existingChapters.map(c => c.id);
         
         if (existingChapterIds.length > 0) {
             await db.sections.where('chapter_id').anyOf(existingChapterIds).delete();
             await db.chapters.where('book_id').equals(bookId).delete();
         }

         if (chaptersToSave.length > 0) {
             await db.chapters.bulkAdd(chaptersToSave);
         }
         if (sectionsToSave.length > 0) {
             await db.sections.bulkAdd(sectionsToSave);
         }
      });

      if (shouldNavigate) {
        // Do nothing, just stay or alert? User said "Remove Save and Start Writing button", so only Save Draft exists.
        // But wait, the previous page logic had two buttons. The user asked to remove "Save and Start Writing".
        // So we only have "Save Draft".
        // The user said "Now save logic is wrong, it should be able to continue editing".
        // So this page is essentially the "Continue Editing" page.
        alert("保存成功！");
      } else {
        alert("保存成功！");
      }

    } catch (error) {
      console.error("Failed to save book:", error);
      alert("保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
  }

  return (
    <main className="min-h-screen bg-background p-8 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" className="pl-0 hover:pl-2 transition-all">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">编辑大纲</h1>
            <Button 
              onClick={() => handleSave(false)} 
              disabled={isSubmitting || !title.trim() || !requirements.trim()}
              variant="secondary"
              className="mr-2"
            >
              {isSubmitting ? "保存中..." : "保存草稿"}
              <Save className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Book Info */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                书籍信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="book-title">书名 <span className="text-destructive">*</span></Label>
                  <Input
                    id="book-title"
                    placeholder="请输入书名..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-requirements">书籍写作要求 <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="book-requirements"
                    placeholder="请输入书籍的写作要求、核心目标或风格指南..."
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

        {/* Outline Builder */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">大纲结构</h2>
            <Button onClick={addPart} variant="outline" className="border-dashed border-primary text-primary hover:bg-primary/5">
              <Plus className="h-4 w-4 mr-2" />
              添加篇 (Part)
            </Button>
          </div>

          {parts.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
              点击上方按钮开始添加“篇”
            </div>
          )}

          <div className="space-y-4">
            {parts.map((part, pIndex) => (
              <Card key={part.id} className="border-l-4 border-l-primary bg-card">
                <CardHeader className="py-3 bg-muted/50 flex flex-row items-center justify-between cursor-pointer" onClick={() => togglePart(part.id)}>
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {expandedParts[part.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span>第 {pIndex + 1} 篇</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removePart(part.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                {expandedParts[part.id] && (
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>篇标题 <span className="text-destructive">*</span></Label>
                        <Input 
                          value={part.title} 
                          onChange={(e) => updatePart(part.id, 'title', e.target.value)} 
                          placeholder="请输入篇标题..."
                          className="font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>篇首语</Label>
                        <Input 
                          value={part.intro} 
                          onChange={(e) => updatePart(part.id, 'intro', e.target.value)} 
                          placeholder="可选：篇首语..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>篇描述 <span className="text-destructive">*</span></Label>
                      <Textarea
                        value={part.description || ''} 
                        onChange={(e) => updatePart(part.id, 'description', e.target.value)} 
                        placeholder="请输入篇描述..."
                        className="min-h-[80px]"
                      />
                    </div>

                    {/* Chapters */}
                    <div className="pl-4 border-l-2 border-border space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">本篇章节</h3>
                        <Button size="sm" variant="secondary" onClick={() => addChapter(part.id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          添加章
                        </Button>
                      </div>

                      {part.chapters.map((chapter, cIndex) => (
                        <div key={chapter.id} className="bg-card border border-border rounded-md p-4 space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleChapter(chapter.id)}>
                              {expandedChapters[chapter.id] ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <span className="font-medium text-sm text-foreground">第 {cIndex + 1} 章</span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeChapter(part.id, chapter.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          {expandedChapters[chapter.id] && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Chapter Content */}
                            <div className="space-y-4 pt-2">
                              <div className="space-y-2">
                                <Label className="text-xs">章标题 <span className="text-destructive">*</span></Label>
                                <Input 
                                  value={chapter.title} 
                                  onChange={(e) => updateChapter(part.id, chapter.id, 'title', e.target.value)} 
                                  className="font-semibold"
                                  placeholder="请输入章标题..."
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label className="text-xs">章描述 <span className="text-destructive">*</span></Label>
                                <Textarea
                                  value={chapter.description || ''}
                                  onChange={(e) => updateChapter(part.id, chapter.id, 'description', e.target.value)}
                                  className="min-h-[60px]"
                                  placeholder="请输入章描述..."
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs">章引言</Label>
                                <Input 
                                  value={chapter.intro} 
                                  onChange={(e) => updateChapter(part.id, chapter.id, 'intro', e.target.value)} 
                                  placeholder="可选：章引言..."
                                />
                              </div>

                              {/* Sections (Content Generation) */}
                              <div className="pt-2 border-t border-dashed border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs font-semibold flex items-center gap-2">
                                        正文生成
                                        <div className="w-[200px]">
                                            <Select value={selectedModel} onValueChange={setSelectedModel}>
                                                <SelectTrigger className="h-7 text-xs">
                                                    <SelectValue placeholder="选择模型" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableModels.map(model => (
                                                        <SelectItem key={model.value} value={model.value} className="text-xs">
                                                            {model.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={() => addSection(part.id, chapter.id)}
                                            className="h-7 text-xs border-dashed"
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            添加节
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            onClick={() => handleGenerateChapterContent(pIndex, cIndex)}
                                            disabled={generatingChapters[chapter.id]}
                                            className="h-7 text-xs bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0"
                                        >
                                            <Sparkles className="h-3 w-3 mr-1" />
                                            {generatingChapters[chapter.id] ? "生成中..." : "一键生成节描述"}
                                        </Button>
                                        <Button 
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMergeChapterContent(pIndex, cIndex);
                                            }}
                                            className="h-7 text-xs"
                                        >
                                            <Files className="h-3 w-3 mr-2" />
                                            合并本章正文
                                        </Button>
                                    </div>
                                </div>
                                
                                {chapter.sections.map((section, sIndex) => (
                                    <div key={section.id} className="border border-border/50 rounded-md p-3 bg-card/50 hover:bg-card transition-colors">
                                        {/* Section Header: Title and Tools */}
                                        <div className="flex flex-col gap-1 mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground w-5 flex-shrink-0 font-mono">{sIndex + 1}.</span>
                                                <Input 
                                                    value={section.title}
                                                    onChange={(e) => updateSection(part.id, chapter.id, section.id, 'title', e.target.value)}
                                                    className="h-8 font-medium flex-1"
                                                    placeholder="节标题"
                                                />
                                                <div className="flex items-center gap-1">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-muted-foreground"
                                                        onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                                                    >
                                                        {collapsedSections[section.id] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeSection(part.id, chapter.id, section.id); }}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            {collapsedSections[section.id] && section.description && (
                                                <div className="text-xs text-muted-foreground ml-7 line-clamp-2 pl-1 border-l-2 border-primary/20">
                                                    {section.description}
                                                </div>
                                            )}
                                        </div>

                                        {!collapsedSections[section.id] && (
                                            <div className="space-y-4 pl-7">
                                                {/* Description / Prompt */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <Label className="text-xs text-muted-foreground">节描述 / 写作指引</Label>
                                                        {!section.content && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                className="h-6 text-xs border-dashed border-primary/50 text-primary hover:bg-primary/5"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleGenerateSectionContent(pIndex, cIndex, sIndex);
                                                                }}
                                                                disabled={generatingSections[section.id]}
                                                            >
                                                                {generatingSections[section.id] ? (
                                                                    <>
                                                                        <Sparkles className="h-3 w-3 mr-1 animate-spin" />
                                                                        生成中...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Sparkles className="h-3 w-3 mr-1" />
                                                                        一键生成正文
                                                                    </>
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <Textarea 
                                                        value={section.description || ''}
                                                        onChange={(e) => updateSection(part.id, chapter.id, section.id, 'description', e.target.value)}
                                                        className="min-h-[80px] text-sm bg-muted/20 resize-y"
                                                        placeholder="本节的详细描述、关键点或写作要求..."
                                                    />
                                                </div>

                                                {/* Content Area */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <Label className="text-xs text-muted-foreground">
                                                            正文内容 {section.content ? `(${section.content.length} 字)` : ''}
                                                        </Label>
                                                        {section.content && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost" 
                                                                className="h-6 text-xs text-muted-foreground hover:text-primary"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleGenerateSectionContent(pIndex, cIndex, sIndex);
                                                                }}
                                                                disabled={generatingSections[section.id]}
                                                            >
                                                                <Sparkles className="h-3 w-3 mr-1" />
                                                                重写/续写
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <Textarea 
                                                        value={section.content}
                                                        onChange={(e) => updateSection(part.id, chapter.id, section.id, 'content', e.target.value)}
                                                        className="min-h-[400px] font-serif leading-relaxed text-base"
                                                        placeholder="此处显示生成的正文内容..."
                                                    />
                                                </div>

                                                {/* Revision Input */}
                                                <div className="flex gap-2 items-start pt-2">
                                                    <Textarea
                                                        placeholder="输入修改意见（例如：增加更多关于...的细节，或者修改语气为...）"
                                                        value={revisionPrompts[section.id] || ''}
                                                        onChange={(e) => setRevisionPrompts(prev => ({ ...prev, [section.id]: e.target.value }))}
                                                        className="flex-1 text-sm min-h-[80px] resize-y"
                                                    />
                                                    <div className="flex flex-col gap-2 shrink-0">
                                                        <Select value={reviewModel} onValueChange={setReviewModel}>
                                                            <SelectTrigger className="w-[110px] h-9 text-xs">
                                                                <SelectValue placeholder="Model" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {availableModels.map(m => (
                                                                    <SelectItem key={m.value} value={m.value} className="text-xs">
                                                                        {m.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="icon"
                                                                variant="outline"
                                                                className="flex-1"
                                                                onClick={() => handleGenerateSuggestion(pIndex, cIndex, section)}
                                                                disabled={generatingSuggestions[section.id]}
                                                                title="AI 生成修改意见"
                                                            >
                                                                {generatingSuggestions[section.id] ? (
                                                                    <Sparkles className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Wand2 className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="default"
                                                                className="flex-1 px-2 text-xs"
                                                                onClick={() => handleGenerateSectionContent(pIndex, cIndex, sIndex)}
                                                                disabled={generatingSections[section.id]}
                                                                title="根据修改意见重新生成正文"
                                                            >
                                                                {generatingSections[section.id] ? (
                                                                    <Sparkles className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Sparkles className="h-4 w-4 mr-1" />
                                                                )}
                                                                按意见生成
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Search Results / References */}
                                                {chapterSearchResults[chapter.id] && chapterSearchResults[chapter.id].length > 0 && (
                                                  <div className="space-y-2 pt-2 border-t border-border/50">
                                                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                                      <BookOpen className="h-3 w-3" />
                                                      参考资料 (选中的资料将用于下一次修改生成)
                                                    </Label>
                                                    <div className="space-y-2 bg-muted/20 p-2 rounded-md max-h-[300px] overflow-y-auto">
                                                      {chapterSearchResults[chapter.id].map((result, idx) => (
                                                        <div key={idx} className="flex items-start gap-2 p-2 bg-background rounded border border-border/50 text-sm">
                                                           <Checkbox 
                                                              id={`ref-${chapter.id}-${idx}`}
                                                              checked={(chapterSelectedSources[chapter.id] || []).includes(result.url)}
                                                              onCheckedChange={(checked) => {
                                                                 setChapterSelectedSources(prev => {
                                                                    const current = prev[chapter.id] || [];
                                                                    if (checked) {
                                                                       return { ...prev, [chapter.id]: [...current, result.url] };
                                                                    } else {
                                                                       return { ...prev, [chapter.id]: current.filter(u => u !== result.url) };
                                                                    }
                                                                 });
                                                              }}
                                                              className="mt-1"
                                                           />
                                                           <div className="flex-1 space-y-1 overflow-hidden">
                                                             <div className="flex items-center gap-2">
                                                               <label htmlFor={`ref-${chapter.id}-${idx}`} className="font-medium cursor-pointer hover:underline truncate flex-1 block">
                                                                 {result.title}
                                                               </label>
                                                               <span className="text-[10px] px-1 py-0.5 bg-muted rounded text-muted-foreground whitespace-nowrap">
                                                                 {result.source === 'wechat' ? '公众号' : 'Web'}
                                                               </span>
                                                               <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 shrink-0">
                                                                 <ExternalLink className="h-3 w-3" />
                                                               </a>
                                                             </div>
                                                             <p className="text-xs text-muted-foreground line-clamp-2">
                                                               {result.snippet}
                                                             </p>
                                                           </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                {mergedChapterContent[chapter.id] && (
                                  <div className="mt-2 p-4 bg-muted/30 rounded-md border border-border animate-in fade-in zoom-in-95 duration-200">
                                      <div className="flex justify-between items-center mb-2">
                                          <Label className="font-medium text-sm text-primary flex items-center gap-2">
                                            <Files className="h-4 w-4" />
                                            本章合并内容预览
                                          </Label>
                                          <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-6 text-xs"
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigator.clipboard.writeText(mergedChapterContent[chapter.id]);
                                                  alert("已复制到剪贴板");
                                              }}
                                          >
                                              <Copy className="h-3 w-3 mr-1" />
                                              复制全文
                                          </Button>
                                      </div>
                                      <Textarea 
                                          readOnly
                                          value={mergedChapterContent[chapter.id]}
                                          className="min-h-[300px] font-serif text-base leading-relaxed resize-y"
                                      />
                                  </div>
                                )}
                              </div>
                            </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
