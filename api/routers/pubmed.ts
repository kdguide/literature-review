import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { searches, articles } from "@db/schema";
import { eq } from "drizzle-orm";

// PubMed API endpoints
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PROXY_URL = "https://api.allorigins.win/raw?url=";

const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // ms

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry and proxy fallback
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | undefined;

  // Try direct request first
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          ...options?.headers,
        },
      });

      // Check if response is actually JSON
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const text = await res.text();
        if (text.includes("DOCTYPE") || text.includes("<html")) {
          throw new Error("PubMed returned HTML error page");
        }
        // If not actually HTML, continue
      }

      if (res.ok) return res;

      // If rate limited, wait and retry
      if (res.status === 429) {
        await sleep(RETRY_DELAY * (i + 1));
        continue;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err as Error;
      if (i < retries - 1) {
        await sleep(RETRY_DELAY * (i + 1));
      }
    }
  }

  // Try with proxy as fallback
  try {
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options?.headers,
      },
    });
    if (res.ok) return res;
    throw new Error(`Proxy HTTP ${res.status}`);
  } catch {
    throw lastError || new Error("All requests failed");
  }
}

// PubMed article type
export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  abstract: string;
  doi: string;
  url: string;
}

/**
 * Search PubMed and get PMID list
 */
async function searchPubMedIds(
  keyword: string,
  maxResults: number = 15
): Promise<string[]> {
  const url = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    keyword
  )}&retmax=${maxResults}&retmode=json&sort=relevance`;

  const res = await fetchWithRetry(url);
  const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
  return data.esearchresult?.idlist || [];
}

/**
 * Get article details by PMID list
 */
async function fetchArticleDetails(
  pmids: string[]
): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const url = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;

  const res = await fetchWithRetry(url);
  const data = (await res.json()) as {
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
  const result = data.result;

  return pmids
    .map((pmid) => {
      const article = result?.[pmid];
      if (!article) return null;
      return {
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
}

/**
 * Fetch abstracts for PMIDs
 */
async function fetchAbstracts(
  pmids: string[]
): Promise<Record<string, string>> {
  if (pmids.length === 0) return {};

  const url = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract`;

  try {
    const res = await fetchWithRetry(url);
    const xmlText = await res.text();
    const abstracts: Record<string, string> = {};

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
        abstracts[pmid] = abstractMatch[1].replace(/<[^>]+>/g, "");
      }
    }

    return abstracts;
  } catch {
    return {};
  }
}

/**
 * tRPC Router for PubMed operations
 */
export const pubmedRouter = createRouter({
  /**
   * Search PubMed for articles and save to database
   */
  search: publicQuery
    .input(
      z.object({
        topic: z.string().min(1).max(500),
        maxResults: z.number().min(1).max(30).optional().default(15),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { topic, maxResults } = input;

        // 1. Search PubMed for PMIDs
        const pmids = await searchPubMedIds(topic, maxResults);
        if (pmids.length === 0) {
          return { searchId: null, articles: [] };
        }

        // 2. Get article details
        const articleDetails = await fetchArticleDetails(pmids);

        // 3. Fetch abstracts (for first 10) with delay
        if (pmids.length > 0) {
          await sleep(300); // Rate limit compliance
          try {
            const abstracts = await fetchAbstracts(pmids.slice(0, 10));
            articleDetails.forEach((a) => {
              if (abstracts[a.pmid]) {
                a.abstract = abstracts[a.pmid];
              }
            });
          } catch {
            // Abstracts are optional
          }
        }

        // 4. Save to database
        const db = getDb();
        const searchResult = await db
          .insert(searches)
          .values({ topic })
          .returning({ id: searches.id });
        const searchId = searchResult[0].id;

        // Insert articles
        await db.insert(articles).values(
          articleDetails.map((a) => ({
            searchId,
            pmid: a.pmid,
            title: a.title,
            authors: JSON.stringify(a.authors),
            journal: a.journal,
            year: a.year,
            abstract: a.abstract || null,
            doi: a.doi || null,
            url: a.url,
            selected: true,
          }))
        );

        return {
          searchId,
          articles: articleDetails.map((a) => ({
            ...a,
            uid: a.pmid,
          })),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("PubMed search error:", message);
        throw new Error(`PubMed API 请求失败: ${message}，请稍后重试`);
      }
    }),

  /**
   * Get articles for a search
   */
  getArticles: publicQuery
    .input(z.object({ searchId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(articles)
        .where(eq(articles.searchId, input.searchId));

      return rows.map((r) => ({
        uid: String(r.id),
        pmid: r.pmid,
        title: r.title,
        authors: JSON.parse(r.authors) as string[],
        journal: r.journal,
        year: r.year,
        abstract: r.abstract || "",
        doi: r.doi || "",
        url: r.url || `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
        selected: r.selected ?? true,
      }));
    }),

  /**
   * Toggle article selection
   */
  toggleSelection: publicQuery
    .input(
      z.object({ articleId: z.number(), selected: z.boolean() })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(articles)
        .set({ selected: input.selected })
        .where(eq(articles.id, input.articleId));
      return { success: true };
    }),
});
