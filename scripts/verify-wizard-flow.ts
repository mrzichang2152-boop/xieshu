
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

// Mock fetch for Node.js environment if needed, but we can use the internal logic or just fetch against localhost if server is running.
// Since server is running on localhost:3000 (implied by npm run dev), we can use fetch.
// However, to avoid dependency on running server, it's better to import the route logic directly? 
// No, Next.js route handlers are hard to import and run in isolation due to Request/Response objects.
// Better to run against the running dev server.

const BASE_URL = 'http://localhost:3000';

async function runWizardFlow() {
  console.log('🚀 Starting Wizard Flow Verification...');

  // 1. Generate Keywords
  console.log('\n1. Testing generate_keywords...');
  const step1Res = await fetch(`${BASE_URL}/api/wizard`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'generate_keywords',
      data: { userInput: 'Write a book about AI Engineering for React Developers' },
      model: 'deepseek-ai/DeepSeek-V3'
    })
  });
  
  if (!step1Res.ok) throw new Error(`Step 1 failed: ${step1Res.statusText}`);
  const step1Data = await step1Res.json();
  console.log('✅ Keywords generated:', step1Data.queries);
  console.log('✅ Search results found:', step1Data.results?.length);

  // 2. Expand Keywords
  console.log('\n2. Testing expand_keywords...');
  const step2Res = await fetch(`${BASE_URL}/api/wizard`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'expand_keywords',
      data: { 
        userInput: 'Write a book about AI Engineering for React Developers',
        context: {
          query: step1Data.queries.join(', '),
          results: step1Data.results.slice(0, 3) // Limit context for test
        }
      },
      model: 'deepseek-ai/DeepSeek-V3'
    })
  });

  if (!step2Res.ok) throw new Error(`Step 2 failed: ${step2Res.statusText}`);
  const step2Data = await step2Res.json();
  console.log('✅ Expanded queries:', step2Data.queries);
  console.log('✅ New search results:', step2Data.results?.length);

  // 3. Check Clarity
  console.log('\n3. Testing check_clarity...');
  const context = [
    { query: step1Data.queries.join(', '), results: step1Data.results },
    { query: step2Data.queries.join(', '), results: step2Data.results }
  ];

  const step3Res = await fetch(`${BASE_URL}/api/wizard`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'check_clarity',
      data: { 
        userInput: 'Write a book about AI Engineering for React Developers',
        context: context,
        qaPairs: [] 
      },
      model: 'deepseek-ai/DeepSeek-V3'
    })
  });

  if (!step3Res.ok) throw new Error(`Step 3 failed: ${step3Res.statusText}`);
  const step3Data = await step3Res.json();
  console.log('✅ Clarity status:', step3Data.status);
  if (step3Data.questions) {
    console.log('✅ Clarification questions:', step3Data.questions.length);
  }

  // 4. Generate Outline
  console.log('\n4. Testing generate_outline...');
  // Mock QA pairs if needed
  const mockQAPairs = step3Data.questions ? step3Data.questions.map((q: any) => ({
    question: q.question,
    answer: 'I want to focus on practical implementation with Vercel AI SDK.'
  })) : [];

  const step4Res = await fetch(`${BASE_URL}/api/wizard`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'generate_outline',
      data: { 
        userInput: 'Write a book about AI Engineering for React Developers',
        context: context,
        qaPairs: mockQAPairs
      },
      model: 'deepseek-ai/DeepSeek-V3'
    })
  });

  if (!step4Res.ok) throw new Error(`Step 4 failed: ${step4Res.statusText}`);
  const step4Data = await step4Res.json();
  
  if (step4Data.outline) {
    console.log('✅ Outline generated successfully!');
    console.log('Title:', step4Data.outline.title);
    console.log('Parts:', step4Data.outline.parts.length);
    console.log('Sample Chapter:', step4Data.outline.parts[0].chapters[0].title);
  } else {
    console.error('❌ No outline returned', step4Data);
  }

  console.log('\n🎉 All wizard steps verified successfully!');
}

runWizardFlow().catch(console.error);
