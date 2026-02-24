// src/store/use-wizard-store.ts
import { create } from 'zustand';
import { WizardState, SearchResult, QAPair, SearchContext, BookOutline } from '@/types';

interface WizardStore extends WizardState {
  // Actions
  setStep: (step: WizardState['step']) => void;
  setUserInput: (input: string) => void;
  setSelectedModel: (model: string) => void;
  addSearchContext: (context: SearchContext) => void;
  addQAPair: (qa: QAPair) => void;
  updateQAPair: (index: number, answer: string) => void;
  setGeneratedOutline: (outline: BookOutline) => void;
  incrementRound: () => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: WizardState = {
  step: 'input',
  clarification_round: 0,
  history: {
    user_input: '',
    search_contexts: [],
    qa_pairs: [],
  },
  generatedOutline: undefined,
  selectedModel: 'deepseek-ai/DeepSeek-V3',
  error: null,
};

export const useWizardStore = create<WizardStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setError: (error) => set({ error }),
  
  setUserInput: (input) => 
    set((state) => ({ 
      history: { ...state.history, user_input: input } 
    })),

  setSelectedModel: (model) => set({ selectedModel: model }),

  addSearchContext: (context) => 
    set((state) => ({ 
      history: { 
        ...state.history, 
        search_contexts: [...state.history.search_contexts, context] 
      } 
    })),

  addQAPair: (qa) => 
    set((state) => ({ 
      history: { 
        ...state.history, 
        qa_pairs: [...state.history.qa_pairs, qa] 
      } 
    })),

  updateQAPair: (index, answer) =>
    set((state) => {
      const newPairs = [...state.history.qa_pairs];
      if (newPairs[index]) {
        newPairs[index] = { ...newPairs[index], answer };
      }
      return {
        history: { ...state.history, qa_pairs: newPairs }
      };
    }),

  setGeneratedOutline: (outline) => set({ generatedOutline: outline }),

  incrementRound: () => 
    set((state) => ({ 
      clarification_round: state.clarification_round + 1 
    })),

  reset: () => set(initialState),
}));
