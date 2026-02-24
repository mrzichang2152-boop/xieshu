import React from 'react';
import { useBookStore } from '@/store/use-book-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileText, Folder, FolderOpen } from 'lucide-react';

export function WritingSidebar() {
  const { currentBook, activeSectionId, activeChapterId, setActiveSection, setActiveChapter } = useBookStore();

  if (!currentBook) return null;

  return (
    <div className="w-64 border-r bg-muted/10 flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-semibold truncate" title={currentBook.title}>
          {currentBook.title}
        </h2>
        <p className="text-xs text-muted-foreground truncate">
          共 {currentBook.parts.length} 篇
        </p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {currentBook.parts.map((part) => (
            <div key={part.id || Math.random()} className="space-y-1">
              <div className="flex items-center px-2 py-1 text-sm font-medium text-foreground/70">
                <Folder className="mr-2 h-4 w-4" />
                {part.title}
              </div>
              
              <div className="pl-4 space-y-1">
                {part.chapters.map((chapter) => (
                  <div key={chapter.id || Math.random()}>
                    <div 
                      className={cn(
                        "flex items-center px-2 py-1 text-sm font-medium hover:bg-muted/50 rounded cursor-pointer transition-colors",
                        activeChapterId === chapter.id ? "text-primary font-bold bg-muted/30" : "text-foreground/90"
                      )}
                      onClick={() => {
                        console.log('Clicked chapter:', chapter.title, chapter.id);
                        if (chapter.id) setActiveChapter(chapter.id);
                        // Auto-select first section if none selected or if switching chapters
                        if (chapter.sections && chapter.sections.length > 0) {
                          const firstSec = chapter.sections[0];
                          console.log('Auto-selecting section:', firstSec.title, firstSec.id);
                          if (firstSec.id) setActiveSection(firstSec.id);
                        } else {
                            console.log('No sections in chapter');
                        }
                      }}
                    >
                      <FolderOpen className={cn("mr-2 h-3.5 w-3.5", activeChapterId === chapter.id ? "text-primary" : "text-muted-foreground")} />
                      {chapter.title}
                    </div>
                    
                    <div className="pl-4 space-y-0.5 mt-1 border-l ml-3.5 border-border/40">
                      {chapter.sections && chapter.sections.map((section) => (
                        <div
                          key={section.id || Math.random()}
                          className={cn(
                            "flex items-center px-2 py-1.5 text-xs rounded-md cursor-pointer truncate transition-all",
                            activeSectionId === section.id 
                              ? "bg-primary text-primary-foreground shadow-sm font-medium" 
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('Clicked section:', section.title, section.id);
                            if (section.id) setActiveSection(section.id);
                            if (chapter.id) setActiveChapter(chapter.id);
                          }}
                        >
                          <FileText className={cn("mr-2 h-3 w-3 shrink-0", activeSectionId === section.id ? "text-primary-foreground" : "opacity-70")} />
                          <span className="truncate">{section.title}</span>
                          {!section.id && <span className="text-red-500 text-[10px] ml-1">NO ID</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
