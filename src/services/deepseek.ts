// 前端直接调用 DeepSeek API 生成综述

export interface ReviewSection {
  title: string;
  content: string;
}

export interface ReviewResult {
  title: string;
  abstract: string;
  sections: ReviewSection[];
  references: string[];
  fullText: string;
}

const SYSTEM_PROMPT = `你是一位资深学术写作专家，擅长撰写高质量的中英文学术文献综述。

请根据提供的文献列表，撰写一篇结构化的学术文献综述。要求：
1. 综述应包含：摘要、研究背景、主要研究发现分类论述、研究趋势、存在的问题与展望
2. 正文使用学术中文撰写，专业术语可保留英文
3. 每个观点需标注引用来源[序号]
4. 摘要应概括研究背景、主要发现和结论
5. 输出格式为JSON：
{
  "title": "综述标题",
  "abstract": "摘要内容",
  "sections": [
    {"title": "1. 研究背景", "content": "..."},
    {"title": "2. 核心研究发现", "content": "..."}
  ],
  "references": ["[1] 作者. 标题. 期刊. 年份.", "[2] ..."]
}`;

/**
 * 调用 DeepSeek API 生成综述
 */
export async function generateReviewWithDeepSeek(
  topic: string,
  articles: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    abstract: string;
  }>,
  apiKey: string
): Promise<ReviewResult> {
  // Build user prompt
  const articlesText = articles
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title}\n作者: ${a.authors.join(', ')}\n期刊: ${a.journal} (${a.year})\n摘要: ${a.abstract || '无摘要'}`
    )
    .join('\n\n');

  const userPrompt = `请基于以下${articles.length}篇文献撰写学术综述，主题是"${topic}"。\n\n${articlesText}`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`DeepSeek API 错误: ${error}`);
  }

  const data = (await res.json()) as {
    choices?: [{ message?: { content?: string } }];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 返回空内容');

  const parsed = JSON.parse(content);
  const sections: ReviewSection[] = parsed.sections || [];
  const references: string[] = parsed.references || [];

  // Build full text
  let fullText = `# ${parsed.title}\n\n`;
  fullText += `## 摘要\n\n${parsed.abstract}\n\n`;
  sections.forEach((s: ReviewSection) => {
    fullText += `## ${s.title}\n\n${s.content}\n\n`;
  });
  fullText += `## 参考文献\n\n`;
  references.forEach((ref) => {
    fullText += `${ref}\n\n`;
  });

  return {
    title: parsed.title,
    abstract: parsed.abstract,
    sections,
    references,
    fullText,
  };
}
