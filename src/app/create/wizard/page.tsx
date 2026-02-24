'use client';

import { WizardLayout } from "@/components/wizard/wizard-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function WizardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-background">
      <div className="z-10 max-w-4xl w-full flex items-center justify-between font-mono text-sm mb-8">
        <Link href="/create">
            <Button variant="ghost" className="pl-0 hover:pl-2 transition-all">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回选择页
            </Button>
        </Link>
        <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-semibold">AI 大纲向导</span>
        </div>
      </div>

      <WizardLayout />
    </main>
  );
}
