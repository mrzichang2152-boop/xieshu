import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWizardStore } from '@/store/use-wizard-store';
import { useWizardController } from '@/hooks/use-wizard-controller';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/db';
import { useBookStore } from '@/store/use-book-store';
import { Loader2, Copy, Check } from 'lucide-react';

export function StepOutline() {
  const router = useRouter();
  const { loadBook } = useBookStore();
  const { generatedOutline, error, setStep, history } = useWizardStore();
  const controller = useWizardController();
  const refineOutline = controller?.refineOutline;
  
  const [refinement, setRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Extract all unique references from search history
  const allReferences = React.useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refs = new Map<string, { title: string; url: string; source: string }>();
    if (history?.search_contexts) {
      history.search_contexts.forEach(ctx => {
        if (ctx.results) {
          ctx.results.forEach(res => {
            if (!refs.has(res.url)) {
              refs.set(res.url, res);
            }
          });
        }
      });
    }
    return Array.from(refs.values());
  }, [history]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Fallback or loading state if outline is not yet ready
  const outline = generatedOutline; 

  if (error) {
    return (
      <Card className="h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="text-destructive font-bold text-xl">生成失败</div>
        <p className="text-muted-foreground px-8 text-center">{error}</p>
        <Button onClick={() => setStep('clarify')} variant="outline">
          重试 / 调整澄清信息
        </Button>
      </Card>
    );
  }

  if (!outline) {
    return (
      <Card className="h-[80vh] flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">正在生成完整大纲...</p>
      </Card>
    );
  }

  const handleRefine = async () => {
    if (!refinement.trim() || !refineOutline) return;
    setIsRefining(true);
    await refineOutline(refinement);
    setIsRefining(false);
    setRefinement('');
  };

  // State for inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editField, setEditField] = useState<'title' | 'intro' | 'summary' | null>(null);

  const startEditing = (id: string, field: 'title' | 'intro' | 'summary', value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditField(field);
    setEditValue(value);
  };

  const saveEdit = () => {
    if (!editingId || !editField || !outline) return;
    
    // Create deep copy of outline to modify
    const newOutline = JSON.parse(JSON.stringify(outline));
    
    // Helper to find and update
    let found = false;
    
    // Check parts
    for (const part of newOutline.parts) {
      if (part.id === editingId) {
        if (editField === 'title' || editField === 'intro') {
          part[editField] = editValue;
          found = true;
        }
        break;
      }
      
      // Check chapters
      for (const chapter of part.chapters) {
        if (chapter.id === editingId) {
          if (editField === 'title' || editField === 'intro' || editField === 'summary') {
            chapter[editField] = editValue;
            found = true;
          }
          break;
        }
        
        // Check sections
        for (const section of chapter.sections) {
          if (section.id === editingId) {
            if (editField === 'title') {
              section.title = editValue;
              found = true;
            }
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    
    if (found) {
      // Update store
      useWizardStore.getState().setGeneratedOutline(newOutline);
    }
    
    setEditingId(null);
    setEditField(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Universal save shortcut: Cmd+Enter or Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
      return;
    }

    if (e.key === 'Enter') {
      // For titles (single line), Enter saves
      if (editField === 'title') {
        e.preventDefault();
        saveEdit();
      }
      // For intro/summary (multiline), Enter inserts newline (default behavior), so we do nothing here
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditField(null);
      setEditValue('');
    }
  };

      const handleStartWriting = async () => {
     // Deep copy and ensure IDs
     const finalOutline = JSON.parse(JSON.stringify(outline));
     
     // Recursively ensure IDs
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const ensureIds = (obj: any) => {
         if (obj && typeof obj === 'object') {
             if (!obj.id && !Array.isArray(obj)) obj.id = crypto.randomUUID();
             for (const key in obj) {
                 if (Array.isArray(obj[key])) {
                     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                     obj[key].forEach((item: any) => ensureIds(item));
                 }
             }
         }
     };
     
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     finalOutline.parts.forEach((part: any) => ensureIds(part));

     // Save to DB
     console.log('Start writing clicked', finalOutline);
     try {
       // 1. Save Book Meta
       console.log('Saving book meta...');
       await db.books.put({
         id: finalOutline.id,
        title: finalOutline.title,
        target_audience: finalOutline.target_audience,
        core_goal: finalOutline.core_goal,
        parts: finalOutline.parts, // Storing full structure for now as per simple schema
        created_at: finalOutline.created_at
      });
      console.log('Book meta saved');

      // 2. Save Chapters and Sections individually if we normalized
      // For now, let's assume `parts` in book object is enough for the outline view,
      // but we also populate the normalized tables for querying.
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const part of finalOutline.parts as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const chapter of part.chapters as any[]) {
          await db.chapters.put({
            ...chapter,
            book_id: finalOutline.id
          });
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const section of chapter.sections as any[]) {
            await db.sections.put({
              ...section,
              chapter_id: chapter.id
            });
          }
        }
      }
      console.log('Chapters and sections saved');

      // 3. Load into BookStore
      console.log('Loading book into store...');
      await loadBook(finalOutline.id);
      console.log('Book loaded');
      
      // 4. Navigate
      console.log('Navigating to', `/write/${finalOutline.id}`);
      router.push(`/write/${finalOutline.id}`);
      
    } catch (e) {
      console.error("Failed to save book", e);
      alert("保存书籍失败: " + (e as any).message);
    }
  };

  return (
    <Card className="flex flex-col border-none shadow-none bg-transparent">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b mb-6 pb-4 pt-6">
          <div className="flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">审查你的大纲</h2>
                <p className="text-muted-foreground">
                这是为 "{outline.title}" 生成的结构。你可以在开始写作前修改它。
                </p>
            </div>
            <Button onClick={handleStartWriting} size="lg">开始写作</Button>
          </div>
      </div>

      <div className="space-y-10 pb-24">
        {outline.parts.map((part, pIdx) => (
          <div key={part.id} className="space-y-6">
            {/* Part Header */}
            <div 
              className="group relative cursor-pointer rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-all"
              onClick={() => handleCopy(`Part ${pIdx + 1}: ${part.title}\n${part.intro}`, part.id)}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {pIdx + 1}
                </div>
                <div className="flex-1 space-y-2">
                  {editingId === part.id && editField === 'title' ? (
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={saveEdit}
                      autoFocus
                      className="text-xl font-bold min-h-[40px] h-auto py-1 resize-y"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 
                      className="text-xl font-bold tracking-tight text-foreground hover:text-primary transition-colors hover:underline decoration-dashed underline-offset-4"
                      onClick={(e) => startEditing(part.id, 'title', part.title, e)}
                    >
                      {part.title}
                    </h3>
                  )}
                  
                  <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded">
                    <span className="font-semibold shrink-0 text-xs uppercase tracking-wider text-primary/80 mt-0.5">【篇首语】</span>
                    {editingId === part.id && editField === 'intro' ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={saveEdit}
                        autoFocus
                        className="flex-1 min-h-[80px] py-2 px-3 bg-background resize-y"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        className="leading-relaxed hover:text-foreground cursor-text"
                        onClick={(e) => startEditing(part.id, 'intro', part.intro, e)}
                      >
                        {part.intro}
                      </span>
                    )}
                  </div>
                </div>
                {copiedId === part.id ? (
                  <Check className="h-5 w-5 text-green-500 shrink-0" />
                ) : (
                  <Copy className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </div>
            </div>
            
            {/* Chapters Grid */}
            <div className="grid gap-6 pl-8 border-l-2 border-muted ml-6">
              {part.chapters.map((chapter, cIdx) => (
                <Card key={chapter.id} className="overflow-hidden border-muted shadow-sm hover:border-primary/50 transition-colors">
                  <div 
                    className="group flex flex-col gap-2 p-5 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/50"
                    onClick={() => handleCopy(`Chapter ${cIdx + 1}: ${chapter.title}\n${chapter.intro}`, chapter.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                         <span className="text-muted-foreground font-medium text-base bg-muted px-2 py-0.5 rounded shrink-0 self-start mt-1">第{cIdx + 1}章</span> 
                         {editingId === chapter.id && editField === 'title' ? (
                           <Textarea
                             value={editValue}
                             onChange={(e) => setEditValue(e.target.value)}
                             onKeyDown={handleKeyDown}
                             onBlur={saveEdit}
                             autoFocus
                             className="text-lg font-bold min-h-[36px] h-auto py-1 resize-y"
                             onClick={(e) => e.stopPropagation()}
                           />
                         ) : (
                           <h4 
                             className="text-lg font-bold text-foreground hover:text-primary transition-colors hover:underline decoration-dashed underline-offset-4 cursor-text"
                             onClick={(e) => startEditing(chapter.id, 'title', chapter.title, e)}
                           >
                             {chapter.title}
                           </h4>
                         )}
                      </div>
                      {copiedId === chapter.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground/90 bg-muted/20 p-3 rounded border border-muted/50 mt-2">
                      <span className="font-semibold text-xs text-primary/70 mr-1">【章引言】</span>
                      {editingId === chapter.id && editField === 'intro' ? (
                        <Textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={saveEdit}
                          autoFocus
                          className="w-full min-h-[60px] py-2 px-3 bg-background resize-y"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span 
                          className="hover:text-foreground cursor-text"
                          onClick={(e) => startEditing(chapter.id, 'intro', chapter.intro, e)}
                        >
                          {chapter.intro}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 bg-card/50">
                    {chapter.sections && chapter.sections.length > 1 && (
                      <div className="space-y-3">
                         {chapter.sections.map((section, sIdx) => (
                           <div 
                            key={section.id} 
                            className="group flex flex-col gap-2 text-sm cursor-pointer p-3 rounded hover:bg-accent hover:text-accent-foreground transition-all border border-transparent hover:border-border/50"
                            onClick={() => handleCopy(section.title, section.id)}
                           >
                             <div className="flex items-start gap-3">
                                 <span className="font-mono text-muted-foreground font-medium shrink-0 pt-0.5 min-w-[3.5rem]">
                                   第 {cIdx + 1}.{sIdx + 1} 节
                                 </span>
                                 <span className="flex-1 font-medium leading-relaxed pt-0.5">
                                   <div className="flex flex-col gap-1">
                                      {editingId === section.id && editField === 'title' ? (
                                        <Textarea
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          onBlur={saveEdit}
                                          autoFocus
                                          className="min-h-[32px] h-auto py-1 px-1 bg-background w-full resize-y"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <span 
                                          className="hover:text-primary transition-colors hover:underline decoration-dashed underline-offset-4 cursor-text"
                                          onClick={(e) => startEditing(section.id, 'title', section.title, e)}
                                        >
                                          {section.title}
                                        </span>
                                      )}
                                      
                                      {/* Display Key Points/Description */}
                                      {section.key_points && section.key_points.length > 0 && (
                                        <div className="text-xs text-muted-foreground mt-1 space-y-1">
                                          {section.key_points.map((point, pIdx) => (
                                            <p key={pIdx} className="leading-snug">{point}</p>
                                          ))}
                                        </div>
                                      )}
                                   </div>
                                 </span>
                                <span className={`
                                  shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm self-start mt-0.5
                                  ${section.type === 'theory' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                    section.type === 'method' ? 'bg-green-50 text-green-700 border-green-200' :
                                    section.type === 'practice' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                   'bg-purple-50 text-purple-700 border-purple-200'}
                               `}>
                                 {{
                                   theory: '理论',
                                   method: '方法',
                                   practice: '实战',
                                   trend: '前沿'
                                 }[section.type] || section.type}
                               </span>
                               {copiedId === section.id && <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />}
                             </div>
                             
                             {section.search_references && section.search_references.length > 0 && (
                               <div className="pl-[3.5rem] mt-1 space-y-1">
                                 {section.search_references.map((ref, rIdx) => (
                                   <a 
                                     key={rIdx} 
                                     href={ref.url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors truncate"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     <span className="shrink-0">🔗</span>
                                     <span className="truncate hover:underline decoration-dashed underline-offset-2">{ref.title}</span>
                                   </a>
                                 ))}
                               </div>
                             )}
                           </div>
                         ))}
                      </div>
                    )}
                    
                    {chapter.summary && (
                       <div className={`text-sm text-muted-foreground bg-yellow-50/50 -mx-5 -mb-5 px-5 py-3 ${chapter.sections && chapter.sections.length > 1 ? 'mt-5 pt-4 border-t border-dashed' : ''}`}>
                         <span className="font-bold mr-2 text-yellow-700">💡 本章小结:</span>
                         {editingId === chapter.id && editField === 'summary' ? (
                           <Textarea
                             value={editValue}
                             onChange={(e) => setEditValue(e.target.value)}
                             onKeyDown={handleKeyDown}
                             onBlur={saveEdit}
                             autoFocus
                             className="inline-flex min-h-[40px] h-auto py-1 px-1 bg-background min-w-[300px] w-full resize-y align-top"
                             onClick={(e) => e.stopPropagation()}
                           />
                         ) : (
                           <span 
                             className="hover:text-foreground cursor-text"
                             onClick={(e) => startEditing(chapter.id, 'summary', chapter.summary || '', e)}
                           >
                             {chapter.summary}
                           </span>
                         )}
                       </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
            </div>
          ))}

          {/* Global References Section */}
          {allReferences.length > 0 && (
            <div className="space-y-4 pt-8 border-t">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-xl">📚</span> 参考资料与来源
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {allReferences.map((ref, idx) => (
                  <a 
                    key={idx}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card hover:border-primary/30 transition-all group"
                  >
                    <div className="shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors">
                      {ref.source === 'wechat' ? '🟢' : '🌐'}
                    </div>
                    <div className="space-y-1 overflow-hidden">
                      <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {ref.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate opacity-70">
                        {ref.url}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t z-50">
        <div className="max-w-4xl mx-auto flex gap-4">
            <Input 
                placeholder="改进大纲 (例如：'增加关于 RAG 的章节', '使其更具技术性')" 
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                className="bg-background shadow-sm"
            />
            <Button variant="secondary" onClick={handleRefine} disabled={isRefining || !refinement.trim()} className="shrink-0 shadow-sm">
                {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : '优化大纲'}
            </Button>
            <Button onClick={handleStartWriting} className="shrink-0 shadow-sm" size="default">
                确认并开始写作
            </Button>
        </div>
      </div>
    </Card>
  );
}
