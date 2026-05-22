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

// 常见高影响因子期刊映射（IF > 5）
const HIGH_IF_JOURNALS = new Set([
  "nature", "science", "cell", "lancet", "jama", "bmj", "nejm",
  "new england journal of medicine", "nature medicine", "nature reviews",
  "cancer cell", "cancer discovery", "lancet oncology",
  "journal of clinical oncology", "annals of oncology",
  "journal of clinical investigation", "pnas", "blood",
  "gut", "hepatology", "circulation", "journal of the american college of cardiology",
  "european heart journal", "diabetes", "diabetes care",
  "allergy", "journal of allergy and clinical immunology",
  "immunity", "nature immunology", "journal of experimental medicine",
  "molecular cell", "cell metabolism", "developmental cell",
  "nature cell biology", "cell stem cell", "nature neuroscience",
  "brain", "nature genetics", "genome research", "nature reviews genetics",
  "nature reviews molecular cell biology", "nature reviews cancer",
  "annual review of", "trends in", "current opinion in",
  "european urology", "journal of hepatology",
  "gastroenterology", "journal of clinical pathology",
  "journal of the national cancer institute",
  "british journal of cancer", "oncogene",
  "clinical cancer research", "international journal of cancer",
  "radiotherapy and oncology", "journal of thoracic oncology",
  "lung cancer", "journal of clinical endocrinology and metabolism",
  "thyroid", "osteoporosis international",
  "arthritis and rheumatology", "annals of the rheumatic diseases",
  "journal of bone and mineral research", "stroke",
  "neurology", "alzheimers and dementia",
  "journal of pediatrics", "pediatrics",
  "obstetrics and gynecology", "fertility and sterility",
  "human reproduction", "american journal of obstetrics and gynecology",
  "intensive care medicine", "critical care medicine",
  "journal of the american society of nephrology",
  "kidney international", "hypertension",
  "journal of bone and joint surgery", "spine",
  "american journal of respiratory and critical care medicine",
  "chest", "journal of infectious diseases",
  "clinical infectious diseases", "cid",
  "antimicrobial agents and chemotherapy",
  "frontiers in immunology", "frontiers in oncology",
  "international journal of molecular sciences",
  "theranostics", "nano today",
  "small", "acs nano", "advanced materials",
  "advanced functional materials", "advanced science",
  "biomaterials", "acta biomaterialia",
  "nature communications", "science advances",
  "cell reports", "elife", "plos biology",
  "journal of medicinal chemistry", "drug discovery today",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a journal has high impact factor (>5)
 */
function hasHighIF(journal: string): boolean {
  const lower = journal.toLowerCase();
  // Direct match in set
  if (HIGH_IF_JOURNALS.has(lower)) return true;
  // Check if any high IF journal name is included
  for (const hj of HIGH_IF_JOURNALS) {
    if (lower.includes(hj)) return true;
  }
  return false;
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

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          ...options?.headers,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const text = await res.text();
        if (text.includes("DOCTYPE") || text.includes("<html")) {
          throw new Error("PubMed returned HTML error page");
        }
      }

      if (res.ok) return res;

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
  highIF?: boolean;
}

/**
 * Search PubMed and get PMID list with filters
 */
async function searchPubMedIds(
  keyword: string,
  maxResults: number = 100,
  yearFilter: string = "all",
  sortBy: string = "relevance"
): Promise<string[]> {
  // Build date filter
  let dateParams = "";
  if (yearFilter === "recent5") {
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);
    const mindate = `${fiveYearsAgo.getFullYear()}/01/01`;
    const maxdate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
    dateParams = `&mindate=${encodeURIComponent(mindate)}&maxdate=${encodeURIComponent(maxdate)}`;
  }

  // Build sort
  const sortParam = sortBy === "date" ? "&sort=pub+date" : "&sort=relevance";

  const url = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    keyword
  )}&retmax=${maxResults}${dateParams}${sortParam}&retmode=json`;

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
      const journal = article.fulljournalname || article.source || "未知期刊";
      return {
        pmid,
        title: article.title || "无标题",
        authors: (article.authors || [])
          .map((a: { name: string }) => a.name)
          .slice(0, 6),
        journal,
        year: article.pubdate ? article.pubdate.substring(0, 4) : "未知年份",
        abstract: "",
        doi: article.elocationid || "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        highIF: hasHighIF(journal),
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
        maxResults: z.number().min(1).max(100).optional().default(100),
        yearFilter: z.enum(["all", "recent5"]).optional().default("all"),
        ifFilter: z.enum(["all", "high5"]).optional().default("all"),
        sortBy: z.enum(["relevance", "date"]).optional().default("relevance"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { topic, maxResults, yearFilter, ifFilter, sortBy } = input;

        // 1. Search PubMed for PMIDs with filters
        let pmids = await searchPubMedIds(topic, maxResults, yearFilter, sortBy);
        if (pmids.length === 0) {
          return { searchId: null, articles: [] };
        }

        // 2. Get article details
        let articleDetails = await fetchArticleDetails(pmids);

        // 3. Filter by impact factor (high5 = IF > 5)
        if (ifFilter === "high5") {
          articleDetails = articleDetails.filter((a) => a.highIF);
        }

        // 4. Fetch abstracts (for first 10) with delay
        if (articleDetails.length > 0) {
          await sleep(300);
          try {
            const abstracts = await fetchAbstracts(
              articleDetails.slice(0, 10).map((a) => a.pmid)
            );
            articleDetails.forEach((a) => {
              if (abstracts[a.pmid]) {
                a.abstract = abstracts[a.pmid];
              }
            });
          } catch {
            // Abstracts are optional
          }
        }

        // 5. Save to database
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
