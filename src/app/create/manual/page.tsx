'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function ManualCreatePage() {
  const router = useRouter();
  const { setGeneratedOutline } = useWizardStore();
  
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
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [mergedChapterContent, setMergedChapterContent] = useState<Record<string, string>>({});

  const availableModels = [
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
    { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1 (Reasoning)' },
    { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
    { value: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen 2.5 Coder 32B' },
  ];

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
      book_id: '', // Will be set on save
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
    
    const content = chapter.sections
        .map(s => `### ${s.title}\n\n${s.content || ''}`)
        .join('\n\n');
        
    setMergedChapterContent(prev => ({
        ...prev,
        [chapter.id]: content
    }));
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
      const bookIdToUse = currentBookId || generateId();
      const now = Date.now();

      // Construct final outline with IDs populated
      const finalParts = parts.map(p => ({
        ...p,
        chapters: p.chapters.map(c => ({
          ...c,
          book_id: bookIdToUse,
          sections: c.sections.map(s => ({
            ...s,
            chapter_id: c.id
          }))
        }))
      }));

      const bookOutline: BookOutline = {
        id: bookIdToUse,
        title,
        target_audience: 'General',
        core_goal: requirements,
        requirements: requirements,
        parts: finalParts,
        created_at: now,
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
            book_id: bookIdToUse,
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
         const existingChapters = await db.chapters.where('book_id').equals(bookIdToUse).toArray();
         const existingChapterIds = existingChapters.map(c => c.id);
         
         if (existingChapterIds.length > 0) {
             await db.sections.where('chapter_id').anyOf(existingChapterIds).delete();
             await db.chapters.where('book_id').equals(bookIdToUse).delete();
         }

         if (chaptersToSave.length > 0) {
             await db.chapters.bulkAdd(chaptersToSave);
         }
         if (sectionsToSave.length > 0) {
             await db.sections.bulkAdd(sectionsToSave);
         }
      });

      setCurrentBookId(bookIdToUse);

      if (shouldNavigate) {
        router.push(`/write/${bookIdToUse}`);
      } else {
        alert("保存成功！已添加到首页列表。");
      }

    } catch (error) {
      console.error("Failed to save book:", error);
      alert("保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-8 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
            <Link href="/create">
              <Button variant="ghost" className="pl-0 hover:pl-2 transition-all">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">手动创建大纲</h1>
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
                                <Label className="text-xs">本章描述 <span className="text-destructive">*</span></Label>
                                <Textarea 
                                  value={chapter.description || ''} 
                                  onChange={(e) => updateChapter(part.id, chapter.id, 'description', e.target.value)} 
                                  className="min-h-[60px]"
                                  placeholder="关于本章的详细描述或备注（生成正文时将参考此内容）..."
                                  rows={2}
                                />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs">本章简要介绍（可选）</Label>
                                  <Textarea 
                                    value={chapter.intro} 
                                    onChange={(e) => updateChapter(part.id, chapter.id, 'intro', e.target.value)} 
                                    className="min-h-[60px]"
                                    placeholder="本章的简要介绍..."
                                    rows={2}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">本章小结（可选）</Label>
                                  <Textarea 
                                    value={chapter.summary || ''} 
                                    onChange={(e) => updateChapter(part.id, chapter.id, 'summary', e.target.value)} 
                                    className="min-h-[60px]"
                                    placeholder="本章的总结..."
                                    rows={2}
                                  />
                                </div>
                              </div>
                            </div>

                              {/* Sections */}
                            <div className="bg-muted/30 p-3 rounded-md space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs text-muted-foreground">节标题列表</Label>
                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addSection(part.id, chapter.id, '')}>
                                  <Plus className="h-3 w-3 mr-1" /> 添加节
                                </Button>
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
                                                        value={section.content || ''}
                                                        onChange={(e) => updateSection(part.id, chapter.id, section.id, 'content', e.target.value)}
                                                        className="min-h-[300px] font-serif text-base leading-relaxed"
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
                                    </div>
                                  )}
                                </div>
                              ))}
                              {chapter.sections.length === 0 && (
                                <div className="text-xs text-center text-muted-foreground py-2">暂无小节</div>
                              )}
                            </div>
                            
                            {/* Generate Button with Model Selector and Merge Button */}
                            <div className="pt-2 flex flex-col gap-2">
                              <div className="flex justify-end items-center gap-2">
                                <Select value={selectedModel} onValueChange={setSelectedModel}>
                                  <SelectTrigger className="w-[200px] h-8 text-xs">
                                    <SelectValue placeholder="选择生成模型" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableModels.map(model => (
                                      <SelectItem key={model.value} value={model.value} className="text-xs">
                                        {model.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Button 
                                  size="sm" 
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGenerateChapterContent(pIndex, cIndex);
                                  }}
                                  disabled={generatingChapters[chapter.id]}
                                >
                                  {generatingChapters[chapter.id] ? (
                                    <>
                                      <Sparkles className="h-3 w-3 mr-2 animate-spin" />
                                      正在生成...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="h-3 w-3 mr-2" />
                                      一键生成节描述
                                    </>
                                  )}
                                </Button>
                                
                                <Button 
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleMergeChapterContent(pIndex, cIndex);
                                    }}
                                >
                                    <Files className="h-3 w-3 mr-2" />
                                    合并本章正文
                                </Button>
                              </div>

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

      {/* Floating Footer - Removed as per user request, moved save action to header */}
      {/* <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 shadow-lg z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-end gap-4">
          <div className="text-sm text-muted-foreground">
            共 {parts.length} 篇, {parts.reduce((acc, p) => acc + p.chapters.length, 0)} 章
          </div>
          <Button 
            size="lg" 
            onClick={handleStartWriting} 
            disabled={isSubmitting || !title.trim() || parts.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
          >
            {isSubmitting ? "正在创建..." : "确认并开始写作"}
            <Save className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div> */}
    </main>
  );
}
