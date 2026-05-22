import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  BookOpen, Search, Loader2, Check, Copy, Download, 
  ChevronDown, ChevronUp, FileText, AlertCircle, RotateCw,
  Sparkles, ExternalLink, ServerOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/providers/trpc';
import { searchArticles as frontendSearch } from './services/pubmed';
import { generateReview as frontendGenerate } from './services/review';

interface Article {
  uid: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  abstract: string;
  url: string;
  selected?: boolean;
}

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
  isAiGenerated?: boolean;
}

type AppState = 'idle' | 'searching' | 'selecting' | 'generating' | 'review' | 'editing' | 'error';

// Check if error indicates backend is unavailable (HTML response, 404, network error)
function isBackendUnavailable(err: Error): boolean {
  const msg = err.message || '';
  return (
    msg.includes('DOCTYPE') ||
    msg.includes('<!DOCTYPE') ||
    msg.includes('<html') ||
    msg.includes('Unexpected token') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Network') ||
    msg.includes('404') ||
    msg.includes('Only absolute URLs') ||
    msg.includes('fetch') && msg.includes('failed')
  );
}

function App() {
  const [topic, setTopic] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchId, setSearchId] = useState<number | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState('');
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const [useBackend, setUseBackend] = useState(true);
  const [showBackendNotice, setShowBackendNotice] = useState(false);
  // 筛选条件
  const [yearFilter, setYearFilter] = useState<'all' | 'recent5'>('all');
  const [ifFilter, setIfFilter] = useState<'all' | 'high5'>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'date'>('relevance');
  const reviewRef = useRef<HTMLDivElement>(null);

  // tRPC mutations (backend)
  const searchMutation = trpc.pubmed.search.useMutation({
    retry: false,
  });

  const generateMutation = trpc.review.generate.useMutation({
    retry: false,
  });

  // Auto scroll
  useEffect(() => {
    if ((appState === 'selecting' || appState === 'review') && reviewRef.current) {
      setTimeout(() => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [appState]);

  // ===== Search: try backend → fallback to frontend =====
  const handleSearch = useCallback(async () => {
    if (!topic.trim()) return;
    setAppState('searching');
    setError('');
    setArticles([]);
    setSelectedIds(new Set());
    setReview(null);
    setSearchId(null);
    setShowBackendNotice(false);

    if (useBackend) {
      try {
        const data = await searchMutation.mutateAsync({
          topic: topic.trim(),
          maxResults: 100,
          yearFilter,
          ifFilter,
          sortBy,
        });
        if (data.searchId === null) {
          setError('未找到相关文献，请尝试更换关键词或检查拼写。');
          setAppState('error');
          return;
        }
        setSearchId(data.searchId);
        const mapped = data.articles.map((a) => ({
          uid: a.pmid,
          pmid: a.pmid,
          title: a.title,
          authors: a.authors,
          journal: a.journal,
          year: a.year,
          abstract: a.abstract,
          url: a.url,
          selected: true,
        }));
        setArticles(mapped);
        setSelectedIds(new Set(mapped.map((a) => a.uid)));
        setAppState('selecting');
        return;
      } catch (err: unknown) {
        const e = err as Error;
        if (isBackendUnavailable(e)) {
          // Backend not available, switch to frontend mode
          setUseBackend(false);
          setShowBackendNotice(true);
        } else {
          setError(`文献检索失败: ${e.message}`);
          setAppState('error');
          return;
        }
      }
    }

    // Frontend fallback
    try {
      const results = await frontendSearch(topic.trim(), 15);
      if (results.length === 0) {
        setError('未找到相关文献，请尝试更换关键词或检查拼写。');
        setAppState('error');
        return;
      }
      const mapped = results.map((a) => ({ ...a, selected: true }));
      setArticles(mapped);
      setSelectedIds(new Set(mapped.map((a) => a.uid)));
      setAppState('selecting');
    } catch (err: unknown) {
      setError(`文献检索失败: ${(err as Error).message}，请检查网络连接。`);
      setAppState('error');
    }
  }, [topic, useBackend, searchMutation]);

  // ===== Generate Review: try backend → fallback to frontend =====
  const handleGenerateReview = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setAppState('generating');
    setError('');

    const selectedArticles = articles.filter((a) => selectedIds.has(a.uid));

    if (useBackend && searchId) {
      try {
        const data = await generateMutation.mutateAsync({ searchId });
        setReview({
          title: data.title,
          abstract: data.abstract,
          sections: data.sections,
          references: data.references,
          fullText: data.fullText,
          isAiGenerated: data.isAiGenerated,
        });
        setEditText(data.fullText);
        setAppState('review');
        return;
      } catch (err: unknown) {
        const e = err as Error;
        if (isBackendUnavailable(e)) {
          setUseBackend(false);
          setShowBackendNotice(true);
        } else {
          setError(`综述生成失败: ${e.message}`);
          setAppState('selecting');
          return;
        }
      }
    }

    // Frontend fallback
    try {
      const result = await frontendGenerate(
        topic,
        selectedArticles.map((a) => ({
          title: a.title,
          authors: a.authors,
          journal: a.journal,
          year: a.year,
          abstract: a.abstract,
        }))
      );
      setReview({ ...result, isAiGenerated: false });
      setEditText(result.fullText);
      setAppState('review');
    } catch (err: unknown) {
      setError(`综述生成失败: ${(err as Error).message}`);
      setAppState('selecting');
    }
  }, [selectedIds, articles, useBackend, searchId, generateMutation, topic]);

  // Toggle selection
  const toggleSelection = useCallback((uid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a.uid)));
    }
  }, [selectedIds.size, articles]);

  // Retry
  const handleRetry = useCallback(() => {
    setAppState('idle');
    setError('');
    setTopic('');
    setArticles([]);
    setSelectedIds(new Set());
    setReview(null);
    setSearchId(null);
    setUseBackend(true);
    setShowBackendNotice(false);
  }, []);

  // Copy
  const handleCopy = useCallback(async () => {
    const textToCopy = appState === 'editing' ? editText : review?.fullText || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [appState, editText, review]);

  // Export
  const handleExport = useCallback(() => {
    const content = appState === 'editing' ? editText : review?.fullText || '';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `文献综述_${topic.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [appState, editText, review, topic]);

  // Toggle edit
  const toggleEditMode = useCallback(() => {
    if (appState === 'editing') {
      setReview((prev) => (prev ? { ...prev, fullText: editText } : null));
      setAppState('review');
    } else {
      setEditText(review?.fullText || '');
      setAppState('editing');
    }
  }, [appState, editText, review]);

  // Toggle abstract
  const toggleAbstract = useCallback((uid: string) => {
    setExpandedAbstracts((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  // Skeletons
  const renderSkeletons = () => (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 rounded bg-gray-200 mt-1 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-[960px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-[#1A1A2E]">文献综述助手</span>
          </div>
          <span className="text-sm text-gray-400">全栈版</span>
        </div>
      </nav>

      <main className="pt-14">
        {/* Hero */}
        <section className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A2E] mb-4 tracking-tight">
              让文献综述变得简单
            </h1>
            <p className="text-gray-500 text-lg max-w-lg mx-auto leading-relaxed">
              输入研究主题，AI自动检索PubMed文献并生成学术综述
            </p>
          </div>

          {/* Backend notice */}
          {showBackendNotice && (
            <div className="w-full max-w-2xl mb-4">
              <Alert className="bg-amber-50 border-amber-200">
                <ServerOff className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-sm">
                  后端服务未运行，已自动切换为前端直连模式（PubMed直接检索 + 本地综述生成）。功能正常使用。
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Input */}
          <div className="w-full max-w-2xl">
            <div className="flex gap-2">
              <Input
                placeholder="输入研究主题，如：lung cancer immunotherapy"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={appState === 'searching'}
                className="flex-1 h-14 text-lg px-5 border-gray-200 focus:border-blue-600 focus:ring-blue-200 transition-all"
              />
              <Button
                onClick={handleSearch}
                disabled={appState === 'searching' || !topic.trim()}
                className="h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:-translate-y-px active:translate-y-0 disabled:opacity-50"
              >
                {appState === 'searching' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    开始检索
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 筛选条件 */}
          <div className="w-full max-w-2xl mt-4">
            <div className="flex flex-wrap items-center gap-3 justify-center">
              {/* 年份筛选 */}
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-500">年份:</span>
                <button
                  onClick={() => setYearFilter('recent5')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    yearFilter === 'recent5'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  近5年
                </button>
                <button
                  onClick={() => setYearFilter('all')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    yearFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  全部
                </button>
              </div>

              {/* 影响因子筛选 */}
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-500">期刊:</span>
                <button
                  onClick={() => setIfFilter('high5')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    ifFilter === 'high5'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  IF&gt;5
                </button>
                <button
                  onClick={() => setIfFilter('all')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    ifFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  全部
                </button>
              </div>

              {/* 排序方式 */}
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-500">排序:</span>
                <button
                  onClick={() => setSortBy('date')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    sortBy === 'date'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  由新到旧
                </button>
                <button
                  onClick={() => setSortBy('relevance')}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${
                    sortBy === 'relevance'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  相关性
                </button>
              </div>
            </div>
          </div>

          {/* Quick topics */}
          {appState === 'idle' && (
            <div className="mt-8 flex flex-wrap gap-2 justify-center max-w-lg">
              <span className="text-sm text-gray-400">热门主题：</span>
              {[
                'lung cancer immunotherapy',
                'COVID-19 vaccine',
                'diabetes treatment',
                'gene therapy',
                'CRISPR',
              ].map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className="text-sm px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Error */}
        {appState === 'error' && error && (
          <section className="px-4 pb-8">
            <div className="max-w-3xl mx-auto">
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <AlertDescription className="text-red-700 flex-1">
                  {error}
                </AlertDescription>
                <Button variant="outline" size="sm" onClick={handleRetry} className="ml-2">
                  <RotateCw className="w-4 h-4 mr-1" />
                  重试
                </Button>
              </Alert>
            </div>
          </section>
        )}

        {/* Articles */}
        {(appState === 'searching' || appState === 'selecting' || appState === 'generating') && (
          <section className="px-4 pb-16" ref={reviewRef}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-[#1A1A2E]">
                  {appState === 'searching' && '正在检索文献...'}
                  {appState === 'selecting' && `找到 ${articles.length} 篇相关文献`}
                  {appState === 'generating' && 'AI正在生成综述...'}
                </h2>
                {appState === 'generating' && (
                  <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                )}
              </div>

              {appState === 'searching' ? (
                renderSkeletons()
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={selectedIds.size === articles.length && articles.length > 0}
                        onCheckedChange={toggleSelectAll}
                        className="border-gray-300"
                      />
                      <span className="text-sm text-gray-600">
                        已选择 {selectedIds.size} 篇
                      </span>
                    </label>
                    <Button
                      onClick={handleGenerateReview}
                      disabled={selectedIds.size === 0 || appState === 'generating'}
                      className="bg-blue-600 hover:bg-blue-700 text-white transition-all hover:-translate-y-px"
                    >
                      {appState === 'generating' ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      生成综述
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {articles.map((article, index) => (
                      <div
                        key={article.uid}
                        className="bg-white border border-gray-100 rounded-xl p-5 hover:border-blue-200 transition-all hover:shadow-sm relative"
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            <Checkbox
                              checked={selectedIds.has(article.uid)}
                              onCheckedChange={() => toggleSelection(article.uid)}
                              className="border-gray-300"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3
                              className="font-medium text-blue-600 hover:underline cursor-pointer mb-1.5 leading-snug"
                              onClick={() => window.open(article.url, '_blank')}
                            >
                              {article.title}
                              <ExternalLink className="w-3 h-3 inline ml-1 opacity-50" />
                            </h3>

                            <p className="text-sm text-gray-500 mb-2 flex items-center gap-1 flex-wrap">
                              {article.authors.length > 0 ? `${article.authors.join(', ')} 等 · ` : ''}
                              <span className="text-gray-600">{article.journal}</span>
                              {' · '}
                              <span className="text-gray-400">{article.year}</span>
                              {(article as Article & { highIF?: boolean }).highIF && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-50 text-amber-600 rounded-full font-medium">
                                  IF&gt;5
                                </span>
                              )}
                            </p>

                            {article.abstract && (
                              <div className="mt-2">
                                {expandedAbstracts.has(article.uid) ? (
                                  <div>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                      {article.abstract}
                                    </p>
                                    <button
                                      onClick={() => toggleAbstract(article.uid)}
                                      className="text-xs text-blue-500 mt-1 flex items-center gap-0.5"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                      收起摘要
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                                      {article.abstract}
                                    </p>
                                    <button
                                      onClick={() => toggleAbstract(article.uid)}
                                      className="text-xs text-blue-500 mt-1 flex items-center gap-0.5"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                      展开摘要
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            <span className="absolute top-4 right-4 text-xs text-gray-300 font-mono">
                              [{index + 1}]
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Review */}
        {(appState === 'review' || appState === 'editing') && review && (
          <section className="px-4 pb-16">
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h2 className="text-xl font-semibold text-[#1A1A2E]">AI生成综述</h2>
                  {review.isAiGenerated && (
                    <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full font-medium">
                      DeepSeek AI
                    </span>
                  )}
                  {!review.isAiGenerated && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full font-medium">
                      本地生成
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-[#1A1A2E] leading-snug">
                  {review.title.replace(/^##\s*/, '')}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <Button
                  variant={appState === 'editing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleEditMode}
                  className={appState === 'editing' ? 'bg-blue-600' : 'border-gray-200'}
                >
                  <FileText className="w-4 h-4 mr-1.5" />
                  {appState === 'editing' ? '完成编辑' : '编辑模式'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy} className="border-gray-200">
                  {copied ? (
                    <Check className="w-4 h-4 mr-1.5 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1.5" />
                  )}
                  {copied ? '已复制' : '复制全文'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} className="border-gray-200">
                  <Download className="w-4 h-4 mr-1.5" />
                  导出Markdown
                </Button>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={handleRetry} className="border-gray-200 text-gray-500">
                  <RotateCw className="w-4 h-4 mr-1.5" />
                  重新检索
                </Button>
              </div>

              {appState === 'editing' ? (
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[600px] font-mono text-sm leading-relaxed p-5 border-gray-200 focus:border-blue-600 focus:ring-blue-200 resize-y"
                />
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl p-6 md:p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1A1A2E] mb-3">摘要</h3>
                    <p className="text-gray-700 leading-relaxed">{review.abstract}</p>
                  </div>

                  {review.sections.map((section, i) => (
                    <div key={i}>
                      <h3 className="text-lg font-semibold text-[#1A1A2E] mb-3">
                        {section.title.replace(/^##\s*/, '')}
                      </h3>
                      <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {section.content.replace(/每篇综述约[\d.]+元/g, '').replace(/费用[:：][\s\S]*?元/g, '').replace(/##\s*/g, '')}
                      </div>
                    </div>
                  ))}

                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-lg font-semibold text-[#1A1A2E] mb-4">参考文献</h3>
                    <ol className="space-y-2">
                      {review.references.map((ref, i) => (
                        <li key={i} className="text-sm text-gray-600 leading-relaxed pl-2">
                          {ref.replace(/^\[\d+\]\s*/, '').replace(/^\$\d+\s*/, '')}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 px-4">
        <div className="max-w-3xl mx-auto text-center text-sm text-gray-400 space-y-1">
          <p>文献数据来源于 PubMed 数据库 · 综述内容由 AI 辅助生成，仅供参考</p>
          <p className="text-xs">
            {useBackend ? '后端模式：tRPC + DeepSeek AI' : '前端直连模式：PubMed + 本地生成'}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
