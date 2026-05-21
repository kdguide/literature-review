import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { articles, reviews, searches } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "../lib/env";

// DeepSeek API configuration
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

// System prompt for review generation
const REVIEW_SYSTEM_PROMPT = `你是一位资深学术写作专家，擅长撰写高质量的中英文学术文献综述。

请根据提供的文献列表，撰写一篇结构化的学术文献综述。要求：

1. 综述应包含：摘要、研究背景、主要研究发现分类论述、研究趋势、存在的问题与展望
2. 正文使用学术中文撰写，专业术语可保留英文
3. 每个观点需标注引用来源[序号]
4. 摘要应概括研究背景、主要发现和结论
5. 研究背景部分介绍该领域的起源和发展脉络
6. 研究发现部分按主题分类论述，不要简单罗列每篇文献
7. 最后列出完整的参考文献列表

输出格式为JSON：
{
  "title": "综述标题",
  "abstract": "摘要内容",
  "sections": [
    {"title": "1. 研究背景", "content": "..."},
    {"title": "2. 核心研究发现", "content": "..."},
    ...
  ],
  "references": ["[1] 作者. 标题. 期刊. 年份.", "[2] ..."]
}`;

interface ReviewSection {
  title: string;
  content: string;
}

interface ReviewResult {
  title: string;
  abstract: string;
  sections: ReviewSection[];
  references: string[];
  fullText: string;
}

/**
 * Call DeepSeek API to generate a review
 */
async function callDeepSeek(articles: Array<{
  title: string;
  authors: string[];
  journal: string;
  year: string;
  abstract: string;
}>): Promise<ReviewResult | null> {
  if (!env.deepseekApiKey) return null;

  // Build user prompt from articles
  const articlesText = articles.map((a, i) => {
    return `[${i + 1}] ${a.title}\n作者: ${a.authors.join(", ")}\n期刊: ${a.journal} (${a.year})\n摘要: ${a.abstract || "无摘要"}`;
  }).join("\n\n");

  const userPrompt = `请基于以下${articles.length}篇文献撰写学术综述：\n\n${articlesText}`;

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: REVIEW_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!res.ok) {
      console.error("DeepSeek API error:", await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: [{ message?: { content?: string } }];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

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
  } catch (err) {
    console.error("DeepSeek API call failed:", err);
    return null;
  }
}

/**
 * Fallback: Generate review locally when DeepSeek is unavailable
 */
function generateLocalReview(
  topic: string,
  articles: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    abstract: string;
  }>
): ReviewResult {
  const topicClean = topic.trim();

  // Build abstract
  const keyFindings = articles.slice(0, 3).map((a) => a.title);
  const abstract = `本文系统综述了${topicClean}领域的最新研究进展。通过检索PubMed数据库，纳入${articles.length}篇相关文献进行分析。研究表明，该领域在近年取得了显著进展。${keyFindings[0] ? `其中，${keyFindings[0]}为该方向的发展奠定了重要基础。` : ""}${keyFindings[1] ? `此外，${keyFindings[1]}揭示了新的研究视角。` : ""}${keyFindings[2] ? `${keyFindings[2]}则为该领域的未来研究方向提供了重要参考。` : ""}综合分析表明，${topicClean}研究仍面临诸多挑战，需要更多高质量研究加以探索。`;

  // Build sections
  const sections: ReviewSection[] = [
    {
      title: "1. 研究背景与意义",
      content: generateBackground(topicClean, articles.slice(0, 3)),
    },
    {
      title: "2. 研究方法与数据来源",
      content: generateMethods(topicClean, articles.slice(2, 6)),
    },
    {
      title: "3. 核心研究发现",
      content: generateFindings(topicClean, articles.slice(0, 8)),
    },
    {
      title: "4. 研究局限与挑战",
      content: generateChallenges(topicClean),
    },
    {
      title: "5. 未来展望",
      content: generateOutlook(topicClean, articles.slice(-3)),
    },
  ];

  // Build references
  const references = articles.map(
    (a, i) =>
      `[${i + 1}] ${a.authors.join(", ")}. ${a.title}. ${a.journal}. ${a.year}.`
  );

  // Build full text
  let fullText = `# ${topicClean}研究进展：基于文献综述的分析\n\n`;
  fullText += `## 摘要\n\n${abstract}\n\n`;
  sections.forEach((s) => {
    fullText += `## ${s.title}\n\n${s.content}\n\n`;
  });
  fullText += `## 参考文献\n\n`;
  references.forEach((ref) => {
    fullText += `${ref}\n\n`;
  });

  return { title: `${topicClean}研究进展：基于文献综述的分析`, abstract, sections, references, fullText };
}

// Local generation helpers
function generateBackground(
  topic: string,
  articles: Array<{ title: string; authors: string[] }>
): string {
  let text = `${topic}是当前生物医学研究的重要领域之一。随着研究的不断深入，该领域涌现出大量创新性成果，为临床实践和基础研究提供了重要参考。`;
  articles.forEach((a, i) => {
    text += `${a.authors[0] || "研究团队"}等的研究${
      i === 0 ? "为该领域奠定了重要理论基础" : i === 1 ? "进一步推动了该方向的快速发展" : "提供了新的研究视角"
    }[${i + 1}]。`;
  });
  text += `\n\n这些研究表明，深入理解${topic}的作用机制具有重要的科学意义和临床应用价值。`;
  return text;
}

function generateMethods(
  topic: string,
  articles: Array<{ title: string }>
): string {
  const methods = [
    "大规模随机对照试验",
    "多组学整合分析",
    "单细胞测序技术",
    "生物信息学分析",
    "回顾性队列研究",
    "前瞻性观察研究",
  ];
  let text = `当前${topic}相关研究采用了多种研究方法和先进的技术手段。`;
  articles.forEach((a, i) => {
    if (a.title) {
      text += `${a.title}采用了${methods[i % methods.length]}的设计[${i + 3}]。`;
    }
  });
  text += `\n\n在技术层面，高通量测序、生物信息学分析等技术的广泛应用，极大提升了研究者对${topic}分子机制的认知深度，为多维度解析该领域的科学问题提供了强有力的技术支撑。`;
  return text;
}

function generateFindings(
  topic: string,
  articles: Array<{ title: string; authors: string[]; abstract: string }>
): string {
  const findings = [
    `揭示了${topic}的关键作用机制，发现了多个重要的调控靶点`,
    `证实了该方案在改善患者预后方面的显著优势，为临床应用提供了有力证据`,
    `首次系统描述了该现象的发生规律，填补了相关领域的研究空白`,
    `通过多组学分析识别了关键生物标志物，为精准诊疗奠定了基础`,
    `建立了可靠的预测模型，显著提高了风险评估的准确性`,
    `发现了新的治疗靶点，为药物开发提供了重要线索`,
    `系统评估了该治疗策略的安全性，为临床推广提供了数据支持`,
    `提出了创新性理论框架，深化了对该领域科学问题的理解`,
  ];

  let text = "";
  articles.forEach((a, i) => {
    if (a.title) {
      text += `${i + 1}) ${a.title}：该研究由${a.authors[0] || "研究团队"}主持完成，${findings[i % findings.length]}[${i + 1}]。`;
      if (a.abstract) {
        const keySentence = a.abstract
          .split(".")
          .find((s) => s.length > 30 && s.length < 200);
        if (keySentence) {
          text += `研究指出${keySentence.trim()}。`;
        }
      }
      text += "\n\n";
    }
  });
  return text || "该领域核心研究正在积极推进中。";
}

function generateChallenges(topic: string): string {
  return `尽管${topic}研究取得了显著进展，但该领域仍面临诸多挑战：\n\n首先，现有研究样本量普遍偏小，研究结果的普遍适用性有待进一步验证。其次，长期随访数据的缺乏使得对该治疗策略远期疗效和安全性的评估存在局限性。\n\n此外，不同研究之间的异质性较高，包括纳入标准、治疗方案、终点指标等方面存在差异，这为系统评价和荟萃分析带来了困难。基础研究向临床应用的转化效率也有待提高。\n\n最后，该领域缺乏大规模多中心随机对照试验的高质量证据，需要更多严谨的临床研究加以验证。`;
}

function generateOutlook(
  topic: string,
  articles: Array<{ title: string }>
): string {
  let text = `展望未来，${topic}研究有望在以下几个方面取得突破：\n\n1. 开展大规模多中心随机对照试验，为临床决策提供更可靠的循证依据。\n\n2. 利用新兴技术手段，深入揭示${topic}的分子调控机制。`;
  if (articles[0]?.title) {
    text += `${articles[0].title}的研究方向值得进一步探索。`;
  }
  text += `\n\n3. 探索${topic}与现有治疗手段的联合应用，寻求协同增效的治疗方案。\n\n4. 基于生物标志物的患者分层研究，实现个体化精准治疗。\n\n综上所述，${topic}是一个充满活力和发展潜力的研究领域，值得学术界持续关注。`;
  return text;
}

/**
 * tRPC Router for review operations
 */
export const reviewRouter = createRouter({
  /**
   * Generate review from selected articles
   */
  generate: publicQuery
    .input(
      z.object({
        searchId: z.number(),
        articleIds: z.array(z.number()).optional(), // if empty, use all selected
      })
    )
    .mutation(async ({ input }) => {
      const { searchId, articleIds } = input;
      const db = getDb();

      // 1. Get search topic
      const searchRows = await db
        .select()
        .from(searches)
        .where(eq(searches.id, searchId));
      if (searchRows.length === 0) throw new Error("Search not found");
      const topic = searchRows[0].topic;

      // 2. Get articles (filtered by articleIds or selected=true)
      let articleRows;
      if (articleIds && articleIds.length > 0) {
        articleRows = await db
          .select()
          .from(articles)
          .where(and(eq(articles.searchId, searchId)))
          .then((rows) => rows.filter((r) => articleIds.includes(r.id)));
      } else {
        articleRows = await db
          .select()
          .from(articles)
          .where(and(eq(articles.searchId, searchId), eq(articles.selected, true)));
      }

      if (articleRows.length === 0) throw new Error("No articles selected");

      // 3. Prepare article data
      const articleData = articleRows.map((r) => ({
        title: r.title,
        authors: JSON.parse(r.authors) as string[],
        journal: r.journal,
        year: r.year,
        abstract: r.abstract || "",
      }));

      // 4. Try DeepSeek API first, fallback to local generation
      let result = await callDeepSeek(articleData);
      const isAiGenerated = result !== null;

      if (!result) {
        result = generateLocalReview(topic, articleData);
      }

      // 5. Save to database
      await db.insert(reviews).values({
        searchId,
        title: result.title,
        abstract: result.abstract,
        content: result.fullText,
        sections: JSON.stringify(result.sections),
        references: JSON.stringify(result.references),
      });

      return {
        ...result,
        isAiGenerated,
        searchId,
      };
    }),

  /**
   * List all reviews
   */
  list: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: reviews.id,
        title: reviews.title,
        topic: searches.topic,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(searches, eq(reviews.searchId, searches.id))
      .orderBy(reviews.createdAt);
    return rows;
  }),

  /**
   * Get a single review by ID
   */
  get: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(reviews)
        .where(eq(reviews.id, input.id));
      if (rows.length === 0) throw new Error("Review not found");
      const row = rows[0];
      return {
        ...row,
        sections: JSON.parse(row.sections) as ReviewSection[],
        references: JSON.parse(row.references) as string[],
      };
    }),
});
