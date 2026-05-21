// PubMed API 封装 (NCBI E-utilities)

export interface PubMedArticle {
  uid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  abstract: string;
  doi: string;
  pmid: string;
  url: string;
}

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// 使用代理解决CORS问题
const PROXY_URL = 'https://api.allorigins.win/raw?url=';

/**
 * 第一步：通过关键词搜索获取PMID列表
 */
export async function searchPubMed(keyword: string, maxResults: number = 15): Promise<string[]> {
  const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(keyword)}&retmax=${maxResults}&retmode=json&sort=relevance`;
  
  try {
    // 尝试直接请求
    let response;
    try {
      response = await fetch(searchUrl);
    } catch {
      // 如果直接请求失败，通过代理
      response = await fetch(`${PROXY_URL}${encodeURIComponent(searchUrl)}`);
    }
    
    if (!response.ok) {
      throw new Error('PubMed搜索请求失败');
    }
    
    const data = await response.json();
    return data.esearchresult.idlist || [];
  } catch (error) {
    console.error('PubMed搜索错误:', error);
    throw error;
  }
}

/**
 * 第二步：通过PMID列表获取文献详细信息
 */
export async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];
  
  const summaryUrl = `${BASE_URL}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
  
  try {
    let response;
    try {
      response = await fetch(summaryUrl);
    } catch {
      response = await fetch(`${PROXY_URL}${encodeURIComponent(summaryUrl)}`);
    }
    
    if (!response.ok) {
      throw new Error('PubMed详情请求失败');
    }
    
    const data = await response.json();
    const result = data.result;
    
    return pmids.map(pmid => {
      const article = result[pmid];
      if (!article) return null;
      
      return {
        uid: pmid,
        title: article.title || '无标题',
        authors: (article.authors || []).map((a: { name: string }) => a.name).slice(0, 6),
        journal: article.fulljournalname || article.source || '未知期刊',
        year: article.pubdate ? article.pubdate.substring(0, 4) : '未知年份',
        abstract: '', // esummary不返回摘要，需要额外获取
        doi: article.elocationid || '',
        pmid: pmid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      };
    }).filter((a): a is PubMedArticle => a !== null);
  } catch (error) {
    console.error('PubMed详情错误:', error);
    throw error;
  }
}

/**
 * 第三步：获取文献摘要
 */
export async function fetchAbstracts(pmids: string[]): Promise<Record<string, string>> {
  if (pmids.length === 0) return {};
  
  const fetchUrl = `${BASE_URL}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&rettype=abstract`;
  
  try {
    let response;
    try {
      response = await fetch(fetchUrl);
    } catch {
      response = await fetch(`${PROXY_URL}${encodeURIComponent(fetchUrl)}`);
    }
    
    if (!response.ok) {
      throw new Error('PubMed摘要请求失败');
    }
    
    const xmlText = await response.text();
    const abstracts: Record<string, string> = {};
    
    // 简单的XML解析提取摘要
    const articleMatches = xmlText.matchAll(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g);
    
    for (const match of articleMatches) {
      const articleXml = match[0];
      
      // 提取PMID
      const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const pmid = pmidMatch ? pmidMatch[1] : '';
      
      // 提取摘要
      const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
      let abstract = '';
      if (abstractMatch) {
        // 移除XML标签
        abstract = abstractMatch[1].replace(/<[^>]+>/g, '');
      }
      
      if (pmid && abstract) {
        abstracts[pmid] = abstract;
      }
    }
    
    return abstracts;
  } catch (error) {
    console.error('PubMed摘要错误:', error);
    return {}; // 摘要获取失败不影响整体流程
  }
}

/**
 * 综合检索：关键词 → 文献列表（含摘要）
 */
export async function searchArticles(keyword: string, maxResults: number = 15): Promise<PubMedArticle[]> {
  // 1. 搜索PMID
  const pmids = await searchPubMed(keyword, maxResults);
  
  if (pmids.length === 0) {
    return [];
  }
  
  // 2. 获取文献详情
  const articles = await fetchArticleDetails(pmids);
  
  // 3. 获取摘要（尝试获取，失败不影响）
  try {
    const abstracts = await fetchAbstracts(pmids.slice(0, 10)); // 只获取前10篇的摘要，加快速度
    articles.forEach(article => {
      if (abstracts[article.pmid]) {
        article.abstract = abstracts[article.pmid];
      }
    });
  } catch {
    // 摘要获取失败，使用空摘要继续
  }
  
  return articles;
}
