'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, PenTool } from "lucide-react";
import Link from "next/link";

export default function CreateSelectionPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-background">
      <div className="z-10 max-w-4xl w-full flex items-center justify-between font-mono text-sm mb-12">
        <Link href="/">
            <Button variant="ghost" className="pl-0 hover:pl-2 transition-all">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页
            </Button>
        </Link>
        <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-semibold">选择创建方式</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full">
        <Link href="/create/wizard" className="group">
          <Card className="h-full hover:border-primary transition-all cursor-pointer hover:shadow-lg">
            <CardHeader>
              <div className="mb-4 h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                <BookOpen className="h-6 w-6" />
              </div>
              <CardTitle>AI 辅助生成大纲</CardTitle>
              <CardDescription>
                通过与 AI 对话，逐步构建和完善书籍大纲。适合只有一个模糊想法，需要 AI 协助梳理结构的场景。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <ul className="list-disc list-inside space-y-1">
                  <li>AI 自动搜索背景资料</li>
                  <li>多轮对话澄清需求</li>
                  <li>自动生成完整大纲结构</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/create/manual" className="group">
          <Card className="h-full hover:border-primary transition-all cursor-pointer hover:shadow-lg">
            <CardHeader>
              <div className="mb-4 h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                <PenTool className="h-6 w-6" />
              </div>
              <CardTitle>手动导入大纲生成书</CardTitle>
              <CardDescription>
                已有明确的大纲结构？直接输入或粘贴大纲，快速生成书籍项目并开始写作。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <ul className="list-disc list-inside space-y-1">
                  <li>支持 Markdown 格式导入</li>
                  <li>自定义篇章结构</li>
                  <li>直接进入写作模式</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}
