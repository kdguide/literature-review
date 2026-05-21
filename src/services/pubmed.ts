// 前端 PubMed API 直接调用（备用方案，后端不可用时使用）

export interface PubMedArticle {
  uid: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  abstract: string;
  doi: string;
  url: string;
}

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PROXY_URL = "https://api.allorigins.win/raw?url=";

async function fetchWithFallback(url: string): Promise<Response> {
  // Try direct fetch first
  try {
    const res = await fetch(url);
    if (res.ok) return res;
  } catch {
    // Direct failed, try proxy
  }

  // Try via allorigins proxy
  const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error("PubMed request failed");
  return res;
}

/**
 * Search PubMed directly from frontend
 */
export async function searchArticles(keyword: string, maxResults: number = 15): Promise<PubMedArticle[]> {
  // 1. Search for PMIDs
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    keyword
  )}&retmax=${maxResults}&retmode=json&sort=relevance`;

  const searchRes = await fetchWithFallback(searchUrl);
  const searchData = (await searchRes.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const pmids = searchData.esearchresult?.idlist || [];

  if (pmids.length === 0) return [];

  // 2. Get article details
  const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
  const summaryRes = await fetchWithFallback(summaryUrl);
  const summaryData = (await summaryRes.json()) as {
    result?: Record<
      string,
      {
        title?: string;
        authors?: { name: string }[];
        fulljournalname?: string;
        source?: string;
        pubdate?: string;
        elocationid?: string;
      }
    >;
  };

  const result = summaryData.result;
  const articles: PubMedArticle[] = pmids
    .map((pmid) => {
      const article = result?.[pmid];
      if (!article) return null;
      return {
        uid: pmid,
        pmid,
        title: article.title || "无标题",
        authors: (article.authors || [])
          .map((a: { name: string }) => a.name)
          .slice(0, 6),
        journal: article.fulljournalname || article.source || "未知期刊",
        year: article.pubdate ? article.pubdate.substring(0, 4) : "未知年份",
        abstract: "",
        doi: article.elocationid || "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter((a): a is PubMedArticle => a !== null);

  // 3. Fetch abstracts for first 10
  if (pmids.length > 0) {
    try {
      const abstractUrl = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmids
        .slice(0, 10)
        .join(",")}&rettype=abstract`;
      const abstractRes = await fetchWithFallback(abstractUrl);
      const xmlText = await abstractRes.text();

      const articleMatches = xmlText.matchAll(
        /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g
      );
      for (const match of articleMatches) {
        const articleXml = match[0];
        const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
        const pmid = pmidMatch ? pmidMatch[1] : "";
        const abstractMatch = articleXml.match(
          /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/
        );
        if (abstractMatch && pmid) {
          const article = articles.find((a) => a.pmid === pmid);
          if (article) {
            article.abstract = abstractMatch[1].replace(/<[^>]+>/g, "");
          }
        }
      }
    } catch {
      // Abstracts are optional
    }
  }

  return articles;
}
