// 前端本地综述生成（备用方案，后端不可用时使用）

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

/**
 * 基于选定的文献生成本地综述
 */
export async function generateReview(
  topic: string,
  articles: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    abstract: string;
  }>
): Promise<ReviewResult> {
  // Simulate API delay
  await new Promise((r) => setTimeout(r, 1500));

  const sections = buildSections(topic, articles);
  const abstract = buildAbstract(topic, articles);
  const references = articles.map(
    (a, i) =>
      `[${i + 1}] ${a.authors.join(", ")}. ${a.title}. ${a.journal}. ${a.year}.`
  );

  const fullText = buildFullText(
    `${topic}研究进展：基于文献综述的分析`,
    abstract,
    sections,
    references
  );

  return {
    title: `${topic}研究进展：基于文献综述的分析`,
    abstract,
    sections,
    references,
    fullText,
  };
}

function buildAbstract(
  topic: string,
  articles: Array<{ title: string }>
): string {
  const count = articles.length;
  const keyFindings = articles.slice(0, 3).map((a) => a.title);
  return `本文系统综述了${topic}领域的最新研究进展。通过检索PubMed数据库，纳入${count}篇相关文献进行分析。研究表明，该领域在近年取得了显著进展。${
    keyFindings[0]
      ? `${keyFindings[0]}为该方向的发展奠定了重要基础。`
      : ""
  }${
    keyFindings[1] ? `${keyFindings[1]}揭示了新的研究视角。` : ""
  }${
    keyFindings[2]
      ? `${keyFindings[2]}则为该领域的未来研究方向提供了重要参考。`
      : ""
  }综合分析表明，${topic}研究仍面临诸多挑战，需要更多高质量研究加以探索。`;
}

function buildSections(
  topic: string,
  articles: Array<{ title: string; authors: string[]; abstract: string }>
): ReviewSection[] {
  return [
    {
      title: "1. 研究背景与意义",
      content: generateBackground(topic, articles.slice(0, 3)),
    },
    {
      title: "2. 研究方法与数据来源",
      content: generateMethods(topic, articles.slice(2, 6)),
    },
    {
      title: "3. 核心研究发现",
      content: generateFindings(topic, articles.slice(0, 8)),
    },
    {
      title: "4. 研究局限与挑战",
      content: generateChallenges(topic),
    },
    {
      title: "5. 未来展望",
      content: generateOutlook(topic, articles.slice(-3)),
    },
  ];
}

function generateBackground(
  topic: string,
  articles: Array<{ title: string; authors: string[] }>
): string {
  let text = `${topic}是当前生物医学研究的重要领域之一。随着研究的不断深入，该领域涌现出大量创新性成果，为临床实践和基础研究提供了重要参考。`;
  articles.forEach((a, i) => {
    if (a.title) {
      text += `${a.authors[0] || "研究团队"}等的研究${
        i === 0
          ? "为该领域奠定了重要理论基础"
          : i === 1
          ? "进一步推动了该方向的快速发展"
          : "提供了新的研究视角"
      }[${i + 1}]。`;
    }
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
  text += `\n\n在技术层面，高通量测序、生物信息学分析等技术的广泛应用，极大提升了研究者对${topic}分子机制的认知深度。`;
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
  ];

  let text = "";
  articles.forEach((a, i) => {
    if (a.title) {
      text += `${i + 1}) ${a.title}：该研究由${a.authors[0] || "研究团队"}主持完成，${findings[i % findings.length]}[${i + 1}]。`;
      if (a.abstract) {
        const sentences = a.abstract.split(".");
        const keySentence = sentences.find((s) => s.length > 30 && s.length < 200);
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

function buildFullText(
  title: string,
  abstract: string,
  sections: ReviewSection[],
  references: string[]
): string {
  let text = `# ${title}\n\n## 摘要\n\n${abstract}\n\n`;
  sections.forEach((s) => {
    text += `## ${s.title}\n\n${s.content}\n\n`;
  });
  text += `## 参考文献\n\n`;
  references.forEach((ref) => {
    text += `${ref}\n\n`;
  });
  return text;
}
