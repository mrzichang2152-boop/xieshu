import React, { useState, useEffect } from 'react';
import { useWizardStore } from '@/store/use-wizard-store';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

export function StepClarify() {
  const { history, updateQAPair } = useWizardStore();
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});

  // Identify pending questions (those without answers)
  // We need their *original index* in the history array to update them correctly.
  const pendingQuestionsWithIndex = history.qa_pairs
    .map((qa, idx) => ({ ...qa, originalIndex: idx }))
    .filter(qa => !qa.answer || qa.answer.length === 0);

  // If no pending questions, we are likely processing
  if (pendingQuestionsWithIndex.length === 0) {
     return (
       <Card className="flex flex-col items-center justify-center py-10">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">正在分析清晰度并检查歧义...</p>
    </Card>
     );
  }

  const handleAnswerChange = (originalIndex: number, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [originalIndex]: value }));
  };

  const handleSubmit = () => {
    // Update store with answers
    pendingQuestionsWithIndex.forEach(q => {
      const answer = answers[q.originalIndex];
      if (answer) {
        const answerStr = Array.isArray(answer) ? answer.join(', ') : answer;
        updateQAPair(q.originalIndex, answerStr);
      }
    });
    // Store update will trigger controller to re-evaluate
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>需要进一步澄清</CardTitle>
        <CardDescription>
          为了创建最佳大纲，我需要更多细节。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pendingQuestionsWithIndex.map((qa) => (
          <div key={qa.originalIndex} className="space-y-3">
            <Label className="text-base">{qa.question}</Label>
            
            {qa.options && qa.options.length > 0 ? (
               <div className="space-y-2">
                 {qa.options.map((opt) => (
                   <div key={opt} className="flex items-center space-x-2">
                     <Checkbox 
                        id={`q-${qa.originalIndex}-${opt}`} 
                        checked={Array.isArray(answers[qa.originalIndex]) 
                            ? (answers[qa.originalIndex] as string[]).includes(opt) 
                            : answers[qa.originalIndex] === opt}
                        onCheckedChange={(checked) => {
                            // Simple logic for single/multi toggle simulation
                            // For simplicity, treating as single select for now if we don't have multi-select flag
                            // But let's support multi-select as "array" logic
                            const current = (answers[qa.originalIndex] as string[]) || [];
                            let next;
                            if (checked) {
                                next = [...(Array.isArray(current) ? current : []), opt];
                            } else {
                                next = (Array.isArray(current) ? current : []).filter(v => v !== opt);
                            }
                            // Join immediately or keep as array? 
                            // My handleAnswerChange takes string | string[]
                            // But handleSubmit converts to string.
                            handleAnswerChange(qa.originalIndex, next);
                        }}
                     />
                     <Label htmlFor={`q-${qa.originalIndex}-${opt}`} className="font-normal">{opt}</Label>
                   </div>
                 ))}
                 
                 {/* Manual Input Option */}
                 <div className="flex items-center space-x-2 mt-2">
                   <Checkbox
                      id={`q-${qa.originalIndex}-manual`}
                      checked={!!(Array.isArray(answers[qa.originalIndex]) 
                         ? (answers[qa.originalIndex] as string[]).some(v => !qa.options?.includes(v))
                         : (answers[qa.originalIndex] && !qa.options?.includes(answers[qa.originalIndex] as string)))}
                      onCheckedChange={(checked) => {
                        // If checking manual, we add an empty string or placeholder? 
                        // Actually, better to just show Input if checked, or always show "Other" input
                     }}
                     className="hidden" // Hidden checkbox, we'll just use the Input below as "Other"
                   />
                   <div className="flex-1">
                     <Input 
                       placeholder="其他 (请输入你的答案)..."
                       value={
                         Array.isArray(answers[qa.originalIndex])
                           ? (answers[qa.originalIndex] as string[]).find(v => !qa.options?.includes(v)) || ''
                           : (!qa.options?.includes(answers[qa.originalIndex] as string) ? answers[qa.originalIndex] as string : '')
                       }
                       onChange={(e) => {
                         const val = e.target.value;
                         const current = (answers[qa.originalIndex] as string[]) || [];
                         const knownOptions = qa.options || [];
                         const existingManual = current.find(v => !knownOptions.includes(v));
                         
                         let next = [...current];
                         if (existingManual) {
                           // Replace existing manual
                           next = next.map(v => !knownOptions.includes(v) ? val : v);
                         } else {
                           // Add new manual
                           next.push(val);
                         }
                         // Filter out empty if needed, but let's keep typing
                         handleAnswerChange(qa.originalIndex, next);
                       }}
                     />
                   </div>
                 </div>

               </div>
            ) : (
              <Input 
                value={answers[qa.originalIndex] as string || ''} 
                onChange={(e) => handleAnswerChange(qa.originalIndex, e.target.value)}
                placeholder="请输入你的答案..."
              />
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleSubmit}>提交答案</Button>
      </CardFooter>
    </Card>
  );
}
