# AI智能写书助手 - 技术方案文档 (Technical Design Document)

> **文档状态**：Draft
> **基准 PRD**：`AI_Book_Writer_PRD.md`
> **适用场景**：个人本地化部署，VibeCoding 辅助开发
> **核心原则**：模块解耦、现代技术栈、AI 友好、数据本地化

---

## 1. 架构概览 (Architecture Overview)

本项目采用 **Client-Side First** 架构，所有数据存储在本地浏览器数据库 (IndexedDB)，AI 能力通过 Next.js API Routes 代理转发（隐藏 Key 并解决跨域问题）。

```mermaid
graph TD
    User[用户] --> UI[Next.js UI Components]
    UI --> Store[Zustand State Store]
    UI --> Hooks[Custom React Hooks]
    
    subgraph "Data Layer (Local)"
        Hooks --> DB[Dexie.js (IndexedDB)]
        DB --> Storage[Browser Storage]
    end
    
    subgraph "Service Layer (API)"
        Hooks --> API[Next.js API Routes]
        API --> SearchAggregator[Search Service]
        API --> LLMService[LLM Service]
    end
    
    subgraph "External Providers"
        SearchAggregator --> Bocha[Bocha API (Web)]
        SearchAggregator --> OneBound[OneBound API (WeChat)]
        LLMService --> OpenRouter[OpenRouter API]
    end
```

---

## 2. 目录结构规范 (Directory Structure)

为确保 VibeCoding 过程中的临时文件不污染核心代码，我们将明确划分“源码区”和“辅助区”。

```text
.
├── .env.local                  # 环境变量 (API Keys)
├── .gitignore                  # Git 忽略规则
├── next.config.mjs
├── package.json
├── tsconfig.json
│
├── src/                        # [源码区] 核心业务代码
│   ├── app/                    # Next.js App Router 路由
│   │   ├── api/                # 后端 API 代理
│   │   ├── wizard/             # 大纲向导页面
│   │   ├── editor/             # 写作编辑器页面
│   │   └── page.tsx            # 首页
│   │
│   ├── components/             # UI 组件
│   │   ├── ui/                 # Shadcn/UI 基础组件
│   │   ├── feature/            # 业务组件 (如 OutlineTree, ChatPanel)
│   │   └── layout/             # 布局组件
│   │
│   ├── lib/                    # 通用工具库
│   │   ├── db.ts               # Dexie 数据库实例
│   │   ├── llm.ts              # Vercel AI SDK 配置
│   │   └── utils.ts            # 通用 Helper
│   │
│   ├── services/               # 外部服务封装 (解耦 API 调用)
│   │   ├── bocha.ts            # 博查搜索封装
│   │   ├── onebound.ts         # 万邦公众号搜索封装
│   │   └── search-aggregator.ts # 双引擎聚合逻辑
│   │
│   ├── store/                  # Zustand 状态管理
│   │   ├── use-wizard-store.ts # 向导状态
│   │   └── use-book-store.ts   # 书籍/编辑器状态
│   │
│   └── types/                  # TypeScript 类型定义
│       └── index.ts            # 核心数据模型
│
└── _vibe_workspace/            # [辅助区] VibeCoding 专用工作区
    ├── docs/                   # AI 生成的临时文档
    ├── scripts/                # 测试/验证脚本
    └── tests/                  # 临时单元测试
```

### VibeCoding 隔离策略
在 `.gitignore` 中添加以下规则，确保辅助文件不进入版本控制，保持主仓库纯净：
```gitignore
# VibeCoding Workspace
_vibe_workspace/
!_vibe_workspace/.keep

# Logs & Local Env
.env*.local
npm-debug.log*
```

---

## 3. 数据层设计 (Data Layer - Dexie.js)

使用 `Dexie.js` 管理 IndexedDB，实现完全的本地化存储。

### 3.1 数据库 Schema
```typescript
// src/lib/db.ts

import Dexie, { Table } from 'dexie';
import { BookOutline, BookChapter, BookSection, SearchResult } from '@/types';

class AIWriterDB extends Dexie {
  books!: Table<BookOutline, string>; // id is primary key
  chapters!: Table<BookChapter, string>;
  sections!: Table<BookSection, string>;
  search_cache!: Table<SearchResult & { query: string; timestamp: number }, string>;

  constructor() {
    super('AIWriterDB');
    this.version(1).stores({
      books: 'id, title, created_at',
      chapters: 'id, book_id, status', // 索引 book_id 以便快速查询某书章节
      sections: 'id, chapter_id, type',
      search_cache: 'query, timestamp' // 简单的缓存机制
    });
  }
}

export const db = new AIWriterDB();
```

---

## 4. 状态管理 (State Management - Zustand)

模块化 Store 设计，避免单一巨型 Store。

### 4.1 向导状态 (Wizard Store)
处理大纲生成过程中的复杂交互流。
```typescript
interface WizardStore {
  step: 'input' | 'search' | 'clarify' | 'outline' | 'review';
  userInput: string;
  searchResults: SearchResult[];
  qaHistory: QAPair[];
  
  // Actions
  setStep: (step: WizardStep) => void;
  addSearchResults: (results: SearchResult[]) => void;
  // ...
}
```

### 4.2 编辑器状态 (Editor Store)
处理写作过程中的章节切换、内容更新。
```typescript
interface EditorStore {
  currentBookId: string | null;
  activeChapterId: string | null;
  activeSectionId: string | null;
  isGenerating: boolean;
  
  // Actions
  loadBook: (id: string) => Promise<void>;
  updateSectionContent: (id: string, content: string) => Promise<void>;
}
```

---

## 5. 服务层架构 (Service Layer)

为了应对双引擎搜索和未来的 API 变更，必须将第三方 API 调用封装在 `services/` 目录下。

### 5.1 搜索聚合器 (Search Aggregator)
**核心逻辑**：并行调用，统一数据格式，去重。

```typescript
// src/services/search-aggregator.ts

export async function dualSearch(query: string): Promise<SearchResult[]> {
  // 1. 并行发起请求
  const [webResults, wechatResults] = await Promise.allSettled([
    searchBocha(query),
    searchOneBound(query)
  ]);

  // 2. 结果标准化与聚合
  const results: SearchResult[] = [];

  if (webResults.status === 'fulfilled') {
    results.push(...webResults.value.map(r => ({ ...r, source: 'web' })));
  }

  if (wechatResults.status === 'fulfilled') {
    results.push(...wechatResults.value.map(r => ({ ...r, source: 'wechat' })));
  }

  // 3. 简单的重排或过滤逻辑
  return results;
}
```

### 5.2 LLM 服务 (Vercel AI SDK)
使用 `ai` 库的 `streamText` 进行流式输出，后端 API Route 负责持有 Key。

*   `/api/chat`: 通用对话接口。
*   `/api/generate/outline`: 专用的大纲生成接口（可能包含较长的 System Prompt）。
*   `/api/generate/section`: 专用的章节写作接口。

---

## 6. 开发最佳实践 (Best Practices)

### 6.1 提示词管理 (Prompt Engineering)
不要将 Prompt 散落在代码中。建议在 `src/lib/prompts.ts` 或 `src/config/prompts/` 中集中管理 Prompt 模板。

```typescript
// src/lib/prompts.ts
export const OUTLINE_GENERATION_PROMPT = (goal: string, searchData: string) => `
  Role: Professional Book Editor
  Goal: Create a book outline based on: ${goal}
  Context: ${searchData}
  ...
`;
```

### 6.2 错误处理 (Error Handling)
*   **API 层面**：所有 API 调用需包裹 try-catch，并返回标准化的错误信息给前端。
*   **UI 层面**：使用 `sonner` 或 `toast` 显示用户友好的错误提示（如“搜索服务暂时不可用，已切换至基础模式”）。

### 6.3 样式系统 (Styling)
*   严格遵循 `Tailwind CSS` utility-first 原则。
*   利用 `Shadcn/UI` 的 `cn()` 工具合并类名。
*   定义全局 `globals.css` 变量来控制“工业风”主题色，方便一键换肤。

---

## 7. 实施路线图 (Implementation Roadmap)

1.  **Phase 1: 基础框架搭建**
    *   初始化 Next.js + Tailwind + Shadcn。
    *   配置 `_vibe_workspace` 和 `.gitignore`。
    *   搭建 Dexie 数据库层。

2.  **Phase 2: 服务层打通**
    *   实现 Bocha 和 OneBound 的 API Wrapper。
    *   实现 OpenRouter 的流式调用接口。
    *   编写测试脚本验证 API 连通性（存放于 `_vibe_workspace/scripts`）。

3.  **Phase 3: 核心功能开发**
    *   开发“智能大纲生成”向导 (Wizard)。
    *   开发“沉浸式写作”编辑器 (Editor)。
    *   集成双引擎搜索逻辑。

4.  **Phase 4: 优化与交付**
    *   UI 细节打磨（工业风主题）。
    *   全链路测试。
