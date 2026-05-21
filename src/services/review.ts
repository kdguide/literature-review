// AI综述生成服务

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
 * 基于选定的文献生成综述（模拟AI生成，展示最终效果）
 * 实际部署时，这里应调用后端DeepSeek API代理
 */
export async function generateReview(
  topic: string,
  articles: Array<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    abstract: string;
    pmid: string;
  }>
): Promise<ReviewResult> {
  // 模拟API延迟
  await simulateDelay(2000);
  
  const topicZh = translateTopic(topic);
  
  // 生成综述结构
  const sections = buildSections(topicZh, articles);
  
  // 构建摘要
  const abstract = buildAbstract(topicZh, articles);
  
  // 构建参考文献列表
  const references = articles.map(
    (a, i) => `[${i + 1}] ${a.authors.join(', ')}. ${a.title}. ${a.journal}. ${a.year};${a.pmid}.`
  );
  
  // 构建完整文本
  const fullText = buildFullText(topicZh, abstract, sections, references);
  
  return {
    title: `${topicZh}研究进展：基于文献综述的分析`,
    abstract,
    sections,
    references,
    fullText,
  };
}

function simulateDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 简单的英中主题映射
function translateTopic(topic: string): string {
  const map: Record<string, string> = {
    'lung cancer immunotherapy': '肺癌免疫治疗',
    'lung cancer': '肺癌',
    'immunotherapy': '免疫治疗',
    'covid-19': 'COVID-19',
    'diabetes': '糖尿病',
    'alzheimer': '阿尔茨海默病',
    'cancer': '肿瘤',
    'gene therapy': '基因治疗',
    'crispr': 'CRISPR基因编辑',
  };
  
  const lower = topic.toLowerCase();
  return map[lower] || topic;
}

function buildAbstract(
  topic: string,
  articles: Array<{ title: string; abstract: string }>
): string {
  const count = articles.length;
  const keyFindings = articles.slice(0, 3).map(a => a.title);
  
  return `本文系统综述了${topic}领域的最新研究进展。通过检索PubMed数据库，纳入${count}篇相关文献进行分析。研究表明，该领域在近年取得了显著进展，${keyFindings[0] || '多项关键研究'}为该方向的发展奠定了重要基础。${keyFindings[1] ? '此外，' + keyFindings[1] + '揭示了新的治疗策略。' : ''}${keyFindings[2] ? keyFindings[2] + '则为该领域的未来研究方向提供了重要参考。' : ''}综合分析表明，${topic}研究仍面临诸多挑战，需要更多高质量研究加以探索。`;
}

function buildSections(
  topic: string,
  articles: Array<{ title: string; abstract: string; authors: string[] }>
): ReviewSection[] {
  const sections: ReviewSection[] = [
    {
      title: '1. 研究背景与意义',
      content: generateBackground(topic, articles.slice(0, 2)),
    },
    {
      title: '2. 主要研究方法与技术进展',
      content: generateMethods(topic, articles.slice(2, 5)),
    },
    {
      title: '3. 核心研究发现',
      content: generateFindings(topic, articles.slice(0, 6)),
    },
    {
      title: '4. 临床应用现状',
      content: generateClinical(topic, articles.slice(3, 7)),
    },
    {
      title: '5. 存在的问题与挑战',
      content: generateChallenges(topic),
    },
    {
      title: '6. 未来研究方向与展望',
      content: generateOutlook(topic, articles.slice(-3)),
    },
  ];
  
  return sections;
}

function generateBackground(
  topic: string,
  articles: Array<{ title: string; authors: string[] }>
): string {
  return `${topic}是当前医学研究的热点领域之一。近年来，随着研究的不断深入，该领域涌现出大量创新性成果。${articles[0]?.title ? articles[0].authors[0] + '等' + '的研究为该领域奠定了重要理论基础[1]。' : ''}${articles[1]?.title ? '同时，' + articles[1].authors[0] + '等' + '的开拓性工作进一步推动了该方向的快速发展[2]。' : ''}\n\n这些研究表明，${topic}具有广阔的临床应用前景，深入理解其作用机制对于推动精准医学的发展具有重要意义。`;
}

function generateMethods(
  topic: string,
  articles: Array<{ title: string }>
): string {
  const methods = ['大规模随机对照试验', '多组学整合分析', '单细胞测序技术', '生物信息学分析', '回顾性队列研究'];
  return `当前${topic}研究采用了多种先进的研究方法和技术手段。${articles[0]?.title ? '其中，' + articles[0].title + '采用了' + methods[0] + '的设计，为后续研究提供了高质量证据[3]。' : ''}\n\n在技术层面，${methods[1]}、${methods[2]}等高通量技术的广泛应用，极大提升了研究者对${topic}分子机制的认知深度。${articles[1]?.title ? articles[1].title + '的研究中创新性地应用了' + methods[3] + '方法，揭示了关键的调控网络[4]。' : ''}`;
}

function generateFindings(
  topic: string,
  articles: Array<{ title: string; authors: string[] }>
): string {
  let content = '';
  articles.forEach((article, i) => {
    const idx = i + 1;
    if (article.title) {
      content += `${idx}) ${article.title}：该研究由${article.authors[0] || '研究团队'}主持完成，${getRandomFinding(topic)}[${idx}]。\n\n`;
    }
  });
  return content || '该领域核心研究正在积极推进中，多项关键成果已发表在顶级期刊上。';
}

function generateClinical(topic: string, articles: Array<{ title: string }>): string {
  return `在临床应用层面，${topic}已展现出显著的治疗潜力。多项临床研究证实，基于${topic}的治疗策略能够有效改善患者预后。${articles[0]?.title ? articles[0].title + '的结果显示，接受该治疗的患者群体在主要终点指标上获得了显著改善[4]。' : ''}\n\n然而，目前该技术在临床推广中仍面临标准化方案建立、疗效预测标志物筛选等问题，需要更多循证医学证据的支持。${articles[1]?.title ? articles[1].title + '的研究为个体化治疗方案的制定提供了重要参考[5]。' : ''}`;
}

function generateChallenges(topic: string): string {
  return `尽管${topic}研究取得了显著进展，但该领域仍面临诸多挑战：\n\n首先，现有研究样本量普遍偏小，研究结果的普遍适用性有待进一步验证。其次，长期随访数据的缺乏使得对该治疗策略远期疗效和安全性的评估存在局限性。\n\n此外，不同研究之间的异质性较高，包括纳入标准、治疗方案、终点指标等方面存在差异，这为系统评价和荟萃分析带来了困难。\n\n最后，转化医学研究相对滞后，基础研究成果向临床应用的转化效率有待提高。`;
}

function generateOutlook(
  topic: string,
  articles: Array<{ title: string }>
): string {
  return `展望未来，${topic}研究有望在以下几个方面取得突破：\n\n1. 多中心大样本研究：开展高质量的多中心随机对照试验，为临床决策提供更可靠的循证依据。\n\n2. 机制深入研究：利用新兴技术手段，深入揭示${topic}的分子调控机制。${articles[0]?.title ? articles[0].title + '的研究方向值得进一步探索[' + (articles.length - 2) + ']。' : ''}\n\n3. 联合治疗策略：探索${topic}与现有治疗手段的联合应用，寻求协同增效的治疗方案。\n\n4. 精准医学应用：基于生物标志物的患者分层，实现个体化精准治疗。\n\n综上所述，${topic}是一个充满活力和发展潜力的研究领域，值得学术界和临床医生的持续关注。`;
}

function getRandomFinding(topic: string): string {
  const findings = [
    `揭示了${topic}的关键作用机制，发现了多个重要的调控靶点`,
    `证实了该方案在改善患者生存率方面的显著优势，为临床应用提供了有力证据`,
    `首次系统描述了该现象的发生规律，填补了相关领域的研究空白`,
    `通过多组学分析识别了关键生物标志物，为精准诊疗奠定了基础`,
    `建立了可靠的预测模型，显著提高了风险评估的准确性`,
  ];
  return findings[Math.floor(Math.random() * findings.length)];
}

function buildFullText(
  topic: string,
  abstract: string,
  sections: ReviewSection[],
  references: string[]
): string {
  let text = `# ${topic}研究进展：基于文献综述的分析\n\n`;
  text += `## 摘要\n\n${abstract}\n\n`;
  
  sections.forEach(section => {
    text += `## ${section.title}\n\n${section.content}\n\n`;
  });
  
  text += `## 参考文献\n\n`;
  references.forEach(ref => {
    text += `${ref}\n\n`;
  });
  
  return text;
}
