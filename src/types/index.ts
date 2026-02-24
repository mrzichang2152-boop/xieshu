// src/types/index.ts

// 书籍大纲结构
export interface BookOutline {
  id: string; // UUID
  title: string;
  target_audience: string;
  core_goal: string;
  requirements?: string; // 写作要求
  parts: BookPart[]; // 篇
  created_at: number;
  task_type?: 'outline_wizard' | 'manual_outline'; // 任务来源：AI向导生成 | 手动导入
}

export interface BookPart {
  id: string;
  title: string; // 篇标题
  intro: string; // 篇首语
  description?: string; // 描述
  chapters: BookChapter[];
  order: number;
}

export interface BookChapter {
  id: string;
  book_id: string; // Foreign Key
  title: string;
  intro: string; // 章引言
  description?: string; // 章描述
  summary: string; // 本章小结
  sections: BookSection[]; // 节
  status: 'locked' | 'pending' | 'generating' | 'completed';
  order: number;
}

export interface BookSection {
  id: string;
  chapter_id: string; // Foreign Key
  title: string;
  description?: string; // 节描述
  type: 'theory' | 'method' | 'practice' | 'trend'; // 对应规范中的 A/B/C/D 类型
  key_points: string[];
  content?: string; // 生成的正文
  search_keywords?: string[]; // 自动生成的搜索词
  search_references?: SearchResult[]; // 实际引用的搜索结果
  order: number;
}

// 搜索结果
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'web' | 'wechat'; // 区分来源：全网 or 公众号
  publish_date?: string;
}

// 用户交互状态 (Wizard)
export interface SearchContext {
  query: string;
  results: SearchResult[];
}

export interface QAPair {
  question: string;
  options: string[];
  answer: string[] | string; // 支持多选
}

export interface WizardState {
  step: 'input' | 'search_1' | 'expand' | 'search_2' | 'clarify' | 'outline' | 'review';
  clarification_round: number; // 0, 1, 2
  history: {
    user_input: string;
    search_contexts: SearchContext[]; // 包含 query 和 results
    qa_pairs: QAPair[]; 
  };
  generatedOutline?: BookOutline;
  selectedModel: string;
  error?: string | null;
}
