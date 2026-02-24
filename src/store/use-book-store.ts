// src/store/use-book-store.ts
import { create } from 'zustand';
import { BookOutline, BookChapter, BookSection } from '@/types';
import { db } from '@/lib/db';

interface BookStore {
  currentBook: BookOutline | null;
  activeChapterId: string | null;
  activeSectionId: string | null;
  isGenerating: boolean;
  isLoading: boolean;

  // Actions
  loadBook: (id: string) => Promise<void>;
  setActiveChapter: (id: string | null) => void;
  setActiveSection: (id: string | null) => void;
  setGenerating: (isGenerating: boolean) => void;
  updateSectionContent: (sectionId: string, content: string) => Promise<void>;
}

export const useBookStore = create<BookStore>((set, get) => ({
  currentBook: null,
  activeChapterId: null,
  activeSectionId: null,
  isGenerating: false,
  isLoading: false,

  loadBook: async (id: string) => {
    set({ isLoading: true });
    try {
      const book = await db.books.get(id);
      if (book) {
        // Fetch all related data
        const chapters = await db.chapters.where('book_id').equals(id).toArray();
        // Get all section IDs from these chapters to fetch sections
        // Alternatively, since we don't have a direct index for sections by book_id, 
        // we might need to fetch by chapter_ids. 
        // Or simply: db.sections.where('chapter_id').anyOf(chapterIds)
        
        const chapterIds = chapters.map(c => c.id);
        const sections = await db.sections.where('chapter_id').anyOf(chapterIds).toArray();

        // Create lookup maps for faster access
        const chapterMap = new Map(chapters.map(c => [c.id, c]));
        const sectionMap = new Map(sections.map(s => [s.id, s]));

        // Reconstruct the full tree using the structure from book.parts
        const hydratedParts = book.parts.map(part => ({
          ...part,
          chapters: part.chapters.map(chapStruct => {
            const freshChapter = chapterMap.get(chapStruct.id);
            // If for some reason missing in separate table, fallback to struct (shouldn't happen)
            const baseChapter = freshChapter || chapStruct;
            
            return {
              ...baseChapter,
              sections: chapStruct.sections.map(secStruct => {
                const freshSection = sectionMap.get(secStruct.id);
                return freshSection || secStruct;
              })
            };
          })
        }));

        const hydratedBook = {
          ...book,
          parts: hydratedParts
        };

        set({ currentBook: hydratedBook });
      }
    } catch (error) {
      console.error("Failed to load book", error);
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveChapter: (id) => set({ activeChapterId: id }),
  setActiveSection: (id) => set({ activeSectionId: id }),
  setGenerating: (isGenerating) => set({ isGenerating }),

  updateSectionContent: async (sectionId, content) => {
    // 1. Update DB (Normalized)
    await db.sections.update(sectionId, { content });
    
    // 2. Update Store State (Optimistic)
    set(state => {
      if (!state.currentBook) return {};
      
      const newParts = state.currentBook.parts.map(part => ({
        ...part,
        chapters: part.chapters.map(chapter => ({
          ...chapter,
          sections: chapter.sections.map(section => 
            section.id === sectionId 
              ? { ...section, content } 
              : section
          )
        }))
      }));
      
      return { 
        currentBook: { 
          ...state.currentBook, 
          parts: newParts 
        } 
      };
    });
  }
}));
