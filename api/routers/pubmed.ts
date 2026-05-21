import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { searches, articles } from "@db/schema";
import { eq } from "drizzle-orm";

// PubMed API endpoints (backend direct call, no CORS)
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

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
async function searchPubMedIds(keyword: string, maxResults: number = 15): Promise<string[]> {
  const url = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(keyword)}&retmax=${maxResults}&retmode=json&sort=relevance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("PubMed search failed");
  const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
  return data.esearchresult?.idlist || [];
}

/**
 * Get article details by PMID list
 */
async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const url = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("PubMed summary fetch failed");
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
async function fetchAbstracts(pmids: string[]): Promise<Record<string, string>> {
  if (pmids.length === 0) return {};

  const url = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract`;
  const res = await fetch(url);
  if (!res.ok) return {};

  const xmlText = await res.text();
  const abstracts: Record<string, string> = {};

  // Simple XML parsing to extract abstracts
  const articleMatches = xmlText.matchAll(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g);
  for (const match of articleMatches) {
    const articleXml = match[0];
    const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const pmid = pmidMatch ? pmidMatch[1] : "";

    const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
    if (abstractMatch && pmid) {
      abstracts[pmid] = abstractMatch[1].replace(/<[^>]+>/g, "");
    }
  }

  return abstracts;
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
      const { topic, maxResults } = input;

      // 1. Search PubMed for PMIDs
      const pmids = await searchPubMedIds(topic, maxResults);
      if (pmids.length === 0) {
        return { searchId: null, articles: [] };
      }

      // 2. Get article details
      const articleDetails = await fetchArticleDetails(pmids);

      // 3. Fetch abstracts (for first 10)
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

      // 4. Save to database
      const db = getDb();
      const [searchRecord] = await db.insert(searches).values({ topic }).$returningId();
      const searchId = searchRecord.id;

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
          uid: a.pmid, // compatibility with frontend
        })),
      };
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
    .input(z.object({ articleId: z.number(), selected: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(articles)
        .set({ selected: input.selected })
        .where(eq(articles.id, input.articleId));
      return { success: true };
    }),
});
