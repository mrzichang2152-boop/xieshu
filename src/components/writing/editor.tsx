import React, { useState, useEffect } from 'react';
import { useBookStore } from '@/store/use-book-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, Save } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WritingEditor() {
  const { 
    currentBook, 
    activeSectionId, 
    activeChapterId,
    isGenerating, 
    setGenerating,
    updateSectionContent
  } = useBookStore();

  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [model, setModel] = useState('deepseek-ai/DeepSeek-V3');

  // Find active section data
  const activePart = currentBook?.parts.find(p => p.chapters.some(c => c.id === activeChapterId));
  const activeChapter = activePart?.chapters.find(c => c.id === activeChapterId);
  const activeSection = activeChapter?.sections.find(s => s.id === activeSectionId);

  // Sync content when active section changes
  useEffect(() => {
    if (activeSection) {
      setContent(activeSection.content || '');
      setPrompt('');
    }
  }, [activeSectionId, activeSection]);

  const handleGenerate = async () => {
    if (!activeSection || !currentBook || !activeChapter) return;
    
    setGenerating(true);
    
    try {
      // Gather previous content (simple strategy: all previous sections in this chapter)
      const previousSections = activeChapter.sections.filter(s => {
        // This relies on order in array. 
        // We assume sections are ordered.
        return activeChapter.sections.indexOf(s) < activeChapter.sections.indexOf(activeSection);
      });
      const previousContent = previousSections.map(s => s.content).join('\n\n');

      const res = await fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: activeSection,
          chapter: activeChapter,
          book: { title: currentBook.title }, // Minified book info
          prompt,
          previousContent,
          model
        })
      });

      const data = await res.json();
      
      if (data.content) {
        setContent(data.content);
        await updateSectionContent(activeSection.id, data.content);
      }
    } catch (error) {
      console.error("Generation failed", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (activeSection) {
      await updateSectionContent(activeSection.id, content);
    }
  };

  if (!activeSection) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        选择一个章节以开始写作
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div>
          <h1 className="text-xl font-bold">{activeSection.title}</h1>
          <p className="text-sm text-muted-foreground">
            {activeChapter?.title} • {activePart?.title} • {activeSection.type}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Key Points Reminder */}
          {activeSection.key_points && activeSection.key_points.length > 0 && (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">本节要点</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {activeSection.key_points.map((kp, i) => (
                    <li key={i}>{kp}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Prompt Input */}
          <Card className="border-primary/20 bg-primary/5">
             <CardContent className="p-4 space-y-4">
               <div className="flex items-start space-x-2">
                 <Sparkles className="h-5 w-5 text-primary mt-1" />
                 <div className="flex-1 space-y-2">
                   <p className="text-sm font-medium">AI 写作助手</p>
                   <Input 
                      placeholder="输入具体指令 (可选)。例如：'重点关注历史背景...'" 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                   />
                   <div className="flex justify-between items-center pt-2">
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger className="w-[280px] h-8 text-xs">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deepseek-ai/DeepSeek-V3">DeepSeek V3</SelectItem>
                          <SelectItem value="deepseek-ai/DeepSeek-R1">DeepSeek R1</SelectItem>
                          <SelectItem value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button 
                        size="sm" 
                        onClick={handleGenerate} 
                        disabled={isGenerating}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            生成内容
                          </>
                        )}
                      </Button>
                   </div>
                 </div>
               </div>
             </CardContent>
          </Card>

          <Separator />

          {/* Content Editor */}
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[500px] font-serif text-lg leading-relaxed p-6 resize-none focus-visible:ring-0 border-none shadow-none"
              placeholder="开始写作或生成内容..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
