import React from 'react';
import { useWizardStore } from '@/store/use-wizard-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StepInput } from './step-input';
import { StepClarify } from './step-clarify';
import { StepOutline } from './step-outline';
import { Loader2 } from 'lucide-react';
import { useWizardController } from '@/hooks/use-wizard-controller';

export function WizardLayout() {
  const { step } = useWizardStore();
  
  // Initialize Controller
  useWizardController();

  const renderStep = () => {
    switch (step) {
      case 'input':
        return <StepInput />;
      case 'search_1':
      case 'expand':
      case 'search_2':
        return <LoadingStep step={step} />;
      case 'clarify':
        return <StepClarify />;
      case 'outline':
      case 'review':
        return <StepOutline />; // Review is part of outline editing
      default:
        return <div>Unknown step</div>;
    }
  };

  const isFullWidthStep = step === 'outline' || step === 'review';

  return (
    <div className={`w-full max-w-4xl mx-auto ${isFullWidthStep ? 'pb-20' : 'py-10'}`}>
      {renderStep()}
    </div>
  );
}

function LoadingStep({ step }: { step: string }) {
  const messages = {
    search_1: '正在进行初步概念分析与搜索...',
    expand: '正在扩展概念并生成关键词...',
    search_2: '正在进行深度搜索...',
  };

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">
          {messages[step as keyof typeof messages] || '正在处理...'}
        </p>
      </CardContent>
    </Card>
  );
}
