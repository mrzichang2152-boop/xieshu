import React, { useState } from 'react';
import { useWizardStore } from '@/store/use-wizard-store';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function StepInput() {
  const { setUserInput, setStep, setSelectedModel, selectedModel } = useWizardStore();
  const [input, setInput] = useState('');
  // Use local state for immediate feedback but sync with store
  const [model, setModel] = useState(selectedModel || 'google/gemini-3-pro-preview'); 

  const handleStart = async () => {
    if (!input.trim()) return;
    
    setUserInput(input);
    setSelectedModel(model);
    setStep('search_1');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>定义你的书籍</CardTitle>
        <CardDescription>
          描述你的书籍构思、目标读者和核心目标。AI 将帮助你构建大纲。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="goal">书籍描述</Label>
          <Textarea
            id="goal"
            placeholder="例如：我想写一本关于Web开发者的AI工程化指南..."
            className="min-h-[150px]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="model">思考模型</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="model">
              <SelectValue placeholder="选择一个模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek-ai/DeepSeek-V3">DeepSeek V3</SelectItem>
              <SelectItem value="deepseek-ai/DeepSeek-R1">DeepSeek R1</SelectItem>
              <SelectItem value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            选择一个具有强大推理能力的模型以获得最佳大纲。
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleStart} disabled={!input.trim()}>
          开始生成
        </Button>
      </CardFooter>
    </Card>
  );
}
