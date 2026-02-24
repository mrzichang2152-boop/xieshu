import { useEffect, useRef } from 'react';
import { useWizardStore } from '@/store/use-wizard-store';
import { SearchContext } from '@/types';

export function useWizardController() {
  const { 
    step, 
    history, 
    setStep, 
    addSearchContext, 
    addQAPair,
    generatedOutline,
    setGeneratedOutline,
    selectedModel,
    clarification_round,
    incrementRound,
    setError
  } = useWizardStore();
  
  // To prevent double firing in React Strict Mode
  const processingRef = useRef(false);

  useEffect(() => {
    const processStep = async () => {
      if (processingRef.current) return;
      
      try {
        if (step === 'search_1') {
          processingRef.current = true;
          setError(null);
          // 1. Generate Keywords & Search
          const res = await fetch('/api/wizard', {
            method: 'POST',
            body: JSON.stringify({
              action: 'generate_keywords',
              data: { userInput: history.user_input },
              model: selectedModel 
            })
          });
          
          if (!res.ok) throw new Error(`Search 1 failed: ${res.statusText}`);
          
          const data = await res.json();
          
          if (data.results) {
            addSearchContext({
              query: data.queries.join(', '),
              results: data.results
            });
            setStep('expand');
          }
        } 
        else if (step === 'expand') {
          processingRef.current = true;
          setError(null);
          // 2. Expand & Search
          const res = await fetch('/api/wizard', {
            method: 'POST',
            body: JSON.stringify({
              action: 'expand_keywords',
              data: { 
                userInput: history.user_input,
                context: history.search_contexts 
              },
              model: selectedModel
            })
          });
          
          if (!res.ok) throw new Error(`Search 2 failed: ${res.statusText}`);
          
          const data = await res.json();
          
          if (data.results) {
             addSearchContext({
              query: data.queries.join(', '),
              results: data.results
            });
            setStep('clarify'); 
          }
        }
        else if (step === 'clarify') {
          const hasPendingQuestions = history.qa_pairs.some(qa => !qa.answer || qa.answer.length === 0);
          
          // Safety valve: If we have answered too many questions (e.g. > 6), force proceed to outline
          // This prevents infinite clarification loops if the model is too strict.
          // User feedback: 3 questions are not enough for a whole book. Relaxed to 12.
          if (!hasPendingQuestions && history.qa_pairs.length >= 12) {
             setStep('outline');
             return;
          }

          if (!hasPendingQuestions && !processingRef.current) {
             processingRef.current = true;
             setError(null);
             
             const res = await fetch('/api/wizard', {
              method: 'POST',
              body: JSON.stringify({
                action: 'check_clarity',
                data: { 
                  userInput: history.user_input,
                  context: history.search_contexts,
                  qaPairs: history.qa_pairs,
                  round: clarification_round + 1
                },
                model: selectedModel
              })
            });
            
            if (!res.ok) throw new Error(`Clarification check failed: ${res.statusText}`);
            
            const data = await res.json();
            
            if (data.status === 'ambiguous' && data.questions) {
              // Add questions to store
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.questions.forEach((q: any) => {
                addQAPair({
                  question: q.question,
                  options: q.options || [],
                  answer: '' // Pending
                });
              });
              incrementRound();
              // Reset processing flag to allow re-check after answers
              processingRef.current = false;
            } else {
              // Clear! Go to outline
              setStep('outline');
              processingRef.current = false;
            }
          }
        }
        else if (step === 'outline') {
          if (!generatedOutline && !processingRef.current) {
             processingRef.current = true;
             setError(null);
             
             const res = await fetch('/api/wizard', {
              method: 'POST',
              body: JSON.stringify({
                action: 'generate_outline',
                data: { 
                  userInput: history.user_input,
                  context: history.search_contexts,
                  qaPairs: history.qa_pairs 
                },
                model: selectedModel
              })
            });
            
            if (!res.ok) throw new Error(`Outline generation failed: ${res.statusText}`);
            
            const data = await res.json();
            
            if (data.outline) {
              const outlineWithIds = addIdsToOutline(data.outline);
              setGeneratedOutline(outlineWithIds);
            } else {
              throw new Error("No outline returned from API");
            }
           }
        }
        
      } catch (error) {
        console.error("Wizard Error", error);
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        processingRef.current = false;
      }
    };

    processStep();
  }, [step, history, addSearchContext, setStep, addQAPair, generatedOutline, setGeneratedOutline, selectedModel, setError]);

  const refineOutline = async (instruction: string) => {
    if (!generatedOutline || processingRef.current) return;
    
    try {
      processingRef.current = true;
      const res = await fetch('/api/wizard', {
        method: 'POST',
        body: JSON.stringify({
          action: 'refine_outline',
          data: {
            currentOutline: generatedOutline,
            refinementInstruction: instruction,
            context: history.search_contexts
          },
          model: selectedModel
        })
      });
      const newOutline = await res.json();
      const outlineWithIds = addIdsToOutline(newOutline);
      setGeneratedOutline(outlineWithIds);
    } catch (e) {
      console.error(e);
    } finally {
      processingRef.current = false;
    }
  };

  return {
    refineOutline // Export this
  };
}

// Helper to add IDs to outline
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addIdsToOutline(outline: any) {
  return {
    ...outline,
    id: outline.id || crypto.randomUUID(),
    created_at: outline.created_at || Date.now(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts: outline.parts.map((p: any) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chapters: p.chapters.map((c: any) => ({
        ...c,
        id: c.id || crypto.randomUUID(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sections: c.sections.map((s: any) => ({
          ...s,
          id: s.id || crypto.randomUUID(),
          content: s.content || ''
        }))
      }))
    }))
  };
}
