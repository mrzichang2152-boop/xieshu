export const PROMPTS = {
  // Step 1: Generate Search Keywords based on User Input
  GENERATE_KEYWORDS: `
    You are an expert book editor and researcher.
    Analyze the following user input for a book idea.
    Generate 3-5 distinct, high-value search queries that would help gather necessary context, market trends, and similar works.
    Return a JSON object with a "queries" field containing the array of strings.
    
    User Input: {userInput}
  `,

  // Step 2: Expand and Generate More Keywords
  EXPAND_KEYWORDS: `
    Based on the user input and the initial search results, identify gaps in knowledge or new angles to explore.
    Generate 3-5 NEW search queries to deepen the research.
    Return a JSON object with a "queries" field containing the array of strings.

    User Input: {userInput}
    Previous Context: {context}
  `,

  // Step 3: Clarification Check
  CLARIFICATION_CHECK: `
    You are a senior book editor.
    Based on the user's idea and the research gathered so far, determine if the book's core concept, target audience, and structure are clear enough to generate a detailed outline.
    
    Current Clarification Round: {round} (Max rounds: 4)

    Rules:
    1. If Round < 4: You MUST ask questions to deepen the concept, even if it seems clear. Focus on "Tone", "Specific Chapter Ideas", or "Unique Selling Points". Return "ambiguous".
    2. If Round >= 4: Only ask questions if CRITICAL information is missing. Otherwise, return "clear".
    3. If the user's input is extremely detailed and covers all aspects (Audience, Goal, Structure, Tone, USP), you may return "clear" even in Round 1.

    If CLEAR: Return JSON { "status": "clear" }
    If AMBIGUOUS: Return JSON { 
      "status": "ambiguous", 
      "questions": [
        { "question": "...", "options": ["...", "..."] } 
      ]
    }
    Generate max 3 questions. Options are helpful but allow for open input (don't restrict too much).
    
    IMPORTANT: 
    - Review the "Clarification History" below. Do NOT ask questions that have already been answered.
    - OUTPUT LANGUAGE: ALL questions and options MUST be in CHINESE (Simplified Chinese).

    User Input: {userInput}
    Clarification History: {qaPairs}
    Research Context: {context}
  `,

  // Step 4: Generate Outline
  GENERATE_OUTLINE: `
    You are a best-selling author and structural editor.
    Create a comprehensive book outline based on the user's input, answers to clarification questions, and research findings.
    
    CRITICAL INSTRUCTION:
    You MUST strictly adhere to the "Writing Norms" provided below. These norms define the structural hierarchy, content granularity, and logical flow of the book. 
    Failure to follow these norms will result in rejection.

    RESEARCH HANDLING PROCESS:
    1. ANALYZE: Read all provided "Research Context" items carefully.
    2. FILTER: Explicitly ignore and discard sources that are:
       - Low quality or SEO spam
       - Purely promotional or marketing fluff
       - Repetitive, superficial, or lacking substance
    3. SELECT: Prioritize and select ONLY sources that are:
       - Authoritative and technical
       - Fact-based and data-driven
       - Highly relevant to the specific section
    4. CITE: When you use a selected high-quality source, add it to the 'search_references' field.
    
    OUTPUT LANGUAGE RULE: THE ENTIRE OUTPUT MUST BE IN SIMPLIFIED CHINESE. DO NOT USE ENGLISH. If the search results are in English, YOU MUST TRANSLATE and SYNTHESIZE them into Chinese. Titles, descriptions, summaries, and key points MUST be Chinese.

    === WRITING NORMS START ===
    {writingNorms}
    === WRITING NORMS END ===

    The outline must be structured as follows:
    - Book Title
    - Target Audience
    - Core Goal
    - Parts (at least 3, following the "Macro Architecture" in Norms)
      - Chapters (at least 3 per part, following "Chapter-level Essentials" in Norms)
        - Sections (at least 3 per chapter. STRICT REQUIREMENT: You MUST generate at least 3 distinct sections for EVERY chapter. Single-section chapters are strictly FORBIDDEN.)
          - Section Title
          - Type (theory, method, practice, trend) - Must align with Norms templates
          - Key Points (bullet points)
          - Search References (List of MULTIPLE relevant sources (2-5) from "Research Context". Do NOT limit to just one source.)

    Format the output as a clean JSON object matching this TypeScript interface:
    {
      "title": string,
      "target_audience": string,
      "core_goal": string,
      "parts": [
        {
          "title": string,
          "intro": string,
          "chapters": [
            {
              "title": string,
              "intro": string,
              "summary": string,
              "sections": [
                {
                  "title": string,
                  "type": "theory" | "method" | "practice" | "trend",
                  "key_points": string[],
                  "search_references"?: { title: string, url: string, source: string }[]
                }
              ]
            }
          ]
        }
      ]
    }

    User Input: {userInput}
    Clarification Answers: {qaPairs}
    Research Context: {context}
  `,

  // Step 4.5: Refine Outline
  REFINE_OUTLINE: `
    You are an expert book editor.
    Refine the following book outline based on the user's instruction.
    
    Current Outline:
    {currentOutline}
    
    User Instruction: {refinementInstruction}
    
    Research Context: {context}
    
    CRITICAL INSTRUCTION: 
    You MUST strictly follow the "Writing Norms" provided below.
    Ensure that any changes or additions align with the structural and logical requirements defined in the norms.
    
    OUTPUT LANGUAGE: The entire outline (titles, intros, summaries, key points) MUST be in CHINESE (Simplified Chinese).

    === WRITING NORMS START ===
    {writingNorms}
    === WRITING NORMS END ===
    
    Maintain the original JSON structure.
    If you add new sections or modify existing ones using the "Research Context", strictly populate the "search_references" field with MULTIPLE relevant sources (title and URL). Do not limit to just one.
  `,

  // Step 0: Parse Manual Outline
  PARSE_MANUAL_OUTLINE: `
    You are a structural parser. 
    Your ONLY task is to extract the structure from the user's text into JSON.
    
    CRITICAL RULES:
    1. STRICTLY PRESERVE LANGUAGE: Do NOT translate. If the user input is in Chinese, keep it in Chinese.
    2. STRICTLY PRESERVE CONTENT: Do NOT rewrite, summarize, or "improve" the titles or descriptions. Copy them VERBATIM.
    
    3. EXTRACT INTROS (CRITICAL):
       - "Part Intro" (parts[].intro): Any text appearing AFTER a Part title but BEFORE the first Chapter.
       - "Chapter Intro" (chapters[].intro): Any text appearing AFTER a Chapter title but BEFORE the first Section.
       - IT IS MANDATORY TO CAPTURE THIS TEXT. Do not skip it.
       - Common markers: "【篇首语】", "【章引言】", "核心逻辑:", "摘要:", or simply a text paragraph.
       
    4. EXTRACT SECTION DETAILS:
       - "key_points": Any text appearing AFTER a Section title (e.g., "1.1 Title: Description" -> Description).
       - Also include bullet points under a section as key_points.

    5. NO HALLUCINATIONS: Do NOT invent sections or chapters that are not in the text.
    6. MISSING FIELDS: Only if the text is completely empty, use "".

    === FEW-SHOT EXAMPLES (Follow this logic strictly) ===

    Input Example 1 (Standard):
    第一篇：基础理论
    【篇首语】本篇主要介绍数据定价的经济学原理。
    第1章：数据资产化
    核心逻辑：从资源到资产的跨越。
    1.1 定义

    Output Example 1:
    {
      "parts": [{
        "title": "第一篇：基础理论",
        "intro": "【篇首语】本篇主要介绍数据定价的经济学原理。",
        "chapters": [{
          "title": "第1章：数据资产化",
          "intro": "核心逻辑：从资源到资产的跨越。",
          "sections": [...]
        }]
      }]
    }

    Input Example 2 (Messy / No Markers):
    Part 2: Method
    This part explains how to calculate price. It is very important.
    
    Chapter 3: Cost Method
    Using cost to determine price is the most basic way.
    
    3.1 Direct Cost
    It includes material and labor.

    Output Example 2:
    {
      "parts": [{
        "title": "Part 2: Method",
        "intro": "This part explains how to calculate price. It is very important.",
        "chapters": [{
          "title": "Chapter 3: Cost Method",
          "intro": "Using cost to determine price is the most basic way.",
          "sections": [{
             "title": "3.1 Direct Cost",
             "key_points": ["It includes material and labor."]
          }]
        }]
      }]
    }
    === END EXAMPLES ===

    User Input Text:
    {userInput}
  `,

  // Step 1.5: Generate Keywords from Outline (Gap Analysis)
  GENERATE_KEYWORDS_FROM_OUTLINE: `
    You are a research specialist.
    Analyze the provided Book Outline.
    Identify key concepts, case studies, or technical details that require external verification or enrichment.
    Generate 3-5 specific search queries to gather this missing information.
    
    Focus on:
    - Verifying facts in "theory" sections.
    - Finding real-world examples for "practice" sections.
    - Looking up latest trends for "trend" sections.
    
    Book Outline:
    {outline}
  `,


  // Step 5: Write Section
  WRITE_SECTION: `
    You are a professional book writer.
    Write the content for the following section of a book.
    
    Book Title: {bookTitle}
    Chapter: {chapterTitle}
    Section: {sectionTitle}
    Section Type: {sectionType}
    Key Points to Cover: {keyPoints}

    User Instruction: {userPrompt}

    CRITICAL INSTRUCTION:
    You MUST strictly adhere to the "Writing Norms" provided below. 
    Pay close attention to the "Core Principles" (Five Ones, Loop Requirement, Grounding) and the specific "Section-level Templates" logic.
    
    OUTPUT LANGUAGE: The content MUST be written in CHINESE (Simplified Chinese).
    
    === WRITING NORMS START ===
    {writingNorms}
    === WRITING NORMS END ===

    Writing Guidelines:
    - Use a professional, engaging tone appropriate for the target audience.
    - Strictly follow the key points.
    - If this is a 'theory' section, explain concepts clearly.
    - If 'method', provide actionable steps.
    - If 'practice', give examples or exercises.
    - If 'trend', discuss current landscape.
    - Ensure continuity with previous content if provided.
    - Use Markdown formatting.
    
    Previous Content Context (for continuity):
    {previousContent}

    Research Context (if any):
    {searchContext}
  `,

  // Step: Select Sources for Deep Reading
  SELECT_SOURCES: `
    You are a meticulous researcher.
    Your task is to analyze the search results provided below and select the most high-quality, relevant, and authoritative sources to read in full depth.
    
    CRITERIA FOR SELECTION:
    1. RELEVANCE: The source must be directly related to the user's book topic and queries.
    2. QUALITY: Prefer deep analysis, technical documentation, case studies, or reputable news/blogs over SEO farms or short marketing blurbs.
    3. DIVERSITY: Select a mix of theoretical, practical, and data-driven sources if possible.
    
    CRITICAL EXCLUSION CRITERIA (Discard these immediately):
    - **Empty or Content-Poor Pages**: Pages that are primarily lists of links, navigation menus, or search interfaces without a substantial main article body.
    - **List/Index Pages**: "Reference" tools, directories, or category listings (e.g., mall.cnki.net/reference/ - even if from reputable sites).
    - **Homepage/Portals**: Root URLs (e.g., website.com/, cnki.net) or generic landing pages.
    - **Functional Pages**: Login, Register, Paywall, Shopping Cart, "About Us", "Contact".
    - **Irrelevant Snippets**: Results where the snippet shows only navigation text or unrelated keywords.
    
    Return a JSON object with a "indices" field containing the array of numbers (0-based indices) of the selected results.
    
    Search Results:
    {results}
  `
};
