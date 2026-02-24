import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openrouter } from '@/lib/llm';
import fs from 'fs';
import path from 'path';

import { SearchResult } from '@/types';

export const maxDuration = 300;

export async function POST(req: Request) {
  const { 
    book, 
    part,
    chapter,
    section,
    revisionPrompt,
    searchResults,
    previousContext,
    model 
  } = await req.json();

  const selectedModel = openrouter(model || 'deepseek-ai/DeepSeek-V3');

  try {
    // Read Writing Norms
    let writingNorms = '';
    try {
      const normsPath = path.join(process.cwd(), '写作规范.md');
      if (fs.existsSync(normsPath)) {
        writingNorms = fs.readFileSync(normsPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Failed to read writing norms', e);
    }

    // Construct Search Context
    const searchContext = (searchResults || []).map((r: SearchResult, i: number) => `
[参考文章 ${i+1}]
标题: ${r.title}
来源: ${r.source === 'wechat' ? '微信公众号' : 'Web'}
内容摘要/正文: ${r.snippet}
URL: ${r.url}
`).join('\n\n');

    const systemPrompt = `你是一位专业书籍作者。你的任务是根据大纲和上下文，撰写书中的一个具体小节。

请遵循以下写作规范：
${writingNorms}

【书籍信息】
书籍标题：${book.title}
书籍写作要求：${book.requirements}

【当前位置】
篇：${part.title} (${part.description})
章：${chapter.title} (${chapter.description})
正在写作的小节：${section.title}
小节描述/要求：${section.description}
${revisionPrompt ? `\n【特别修改/写作指令】\n用户提出了以下具体的修改或写作意见，请务必严格遵守：\n${revisionPrompt}\n` : ''}
核心要点：${(section.key_points || []).join('; ')}

【上下文（全书之前的内容累积）】
${previousContext || '这是开头，暂无前文。'}

【参考资料（已过滤的优质文章）】
${searchContext || '暂无参考资料。'}

【任务要求】
1. 专注于撰写"${section.title}"这一节的内容。
2. 保持与前文（上下文）的连贯性，不要重复前文已讲过的内容，也不要抢写后文的内容。
3. 充分利用【参考资料】中的案例、数据、观点。
4. 内容要详实、深入，避免空洞的套话。
5. 直接输出正文内容，不要包含标题（因为标题已由系统显示），也不要包含"好的"等客套话。
6. 使用 Markdown 格式，可以使用加粗、列表等，但**不要使用一级或二级标题**（# 或 ##），因为这只是一个小节。可以使用 ### 来组织小节内的层次。
`;

    const { text } = await generateText({
      model: selectedModel,
      prompt: systemPrompt,
      temperature: 0.7,
    });

    return NextResponse.json({ 
      content: text
    });

  } catch (error) {
    console.error('Section Generation API Error:', error);
    return NextResponse.json({ error: '小节生成失败', details: String(error) }, { status: 500 });
  }
}
