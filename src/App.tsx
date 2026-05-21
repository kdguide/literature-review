import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  BookOpen, Search, Loader2, Check, Copy, Download, 
  ChevronDown, ChevronUp, FileText, AlertCircle, RotateCw,
  Sparkles, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { searchArticles } from './services/pubmed';
import type { PubMedArticle } from './services/pubmed';
import { generateReview } from './services/review';
import type { ReviewResult } from './services/review';

type AppState = 'idle' | 'searching' | 'selecting' | 'generating' | 'review' | 'editing' | 'error';

function App() {
  const [topic, setTopic] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [articles, setArticles] = useState<PubMedArticle[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState('');
  const [editText, setEditText] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);

  // 检查网络状态
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 自动滚动到结果区
  useEffect(() => {
    if ((appState === 'selecting' || appState === 'review') && reviewRef.current) {
      setTimeout(() => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [appState]);

  // 开始检索
  const handleSearch = useCallback(async () => {
    if (!topic.trim()) return;
    
    setAppState('searching');
    setError('');
    setArticles([]);
    setSelectedIds(new Set());
    setReview(null);
    
    try {
      const results = await searchArticles(topic.trim(), 15);
      
      if (results.length === 0) {
        setError('未找到相关文献，请尝试更换关键词或检查拼写。');
        setAppState('error');
        return;
      }
      
      setArticles(results);
      // 默认全选
      setSelectedIds(new Set(results.map(a => a.uid)));
      setAppState('selecting');
    } catch (err) {
      setError('文献检索失败，可能是网络问题。请检查网络连接后重试。');
      setAppState('error');
      console.error(err);
    }
  }, [topic]);

  // 切换文献选择
  const toggleSelection = useCallback((uid: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map(a => a.uid)));
    }
  }, [selectedIds.size, articles]);

  // 生成综述
  const handleGenerateReview = useCallback(async () => {
    if (selectedIds.size === 0) return;
    
    const selectedArticles = articles.filter(a => selectedIds.has(a.uid)).map(a => ({
      title: a.title,
      authors: a.authors,
      journal: a.journal,
      year: a.year,
      abstract: a.abstract,
      pmid: a.pmid,
    }));
    
    setAppState('generating');
    setError('');
    
    try {
      const result = await generateReview(topic, selectedArticles);
      setReview(result);
      setEditText(result.fullText);
      setAppState('review');
    } catch (err) {
      setError('综述生成失败，请重试。');
      setAppState('selecting');
      console.error(err);
    }
  }, [selectedIds, articles, topic]);

  // 重新检索
  const handleRetry = useCallback(() => {
    setAppState('idle');
    setError('');
  }, []);

  // 复制全文
  const handleCopy = useCallback(async () => {
    const textToCopy = appState === 'editing' ? editText : review?.fullText || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级方案
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

  // 导出Markdown
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

  // 切换编辑模式
  const toggleEditMode = useCallback(() => {
    if (appState === 'editing') {
      setReview(prev => prev ? { ...prev, fullText: editText } : null);
      setAppState('review');
    } else {
      setEditText(review?.fullText || '');
      setAppState('editing');
    }
  }, [appState, editText, review]);

  // 展开/收起摘要
  const toggleAbstract = useCallback((uid: string) => {
    setExpandedAbstracts(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }, []);

  // 骨架屏渲染
  const renderSkeletons = () => (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
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
      {/* 顶部导航 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-[960px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-[#1A1A2E]">文献综述助手</span>
          </div>
          <span className="text-sm text-gray-400">极简版</span>
        </div>
      </nav>

      {/* 主体内容 */}
      <main className="pt-14">
        {/* Hero区域 */}
        <section className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A2E] mb-4 tracking-tight">
              让文献综述变得简单
            </h1>
            <p className="text-gray-500 text-lg max-w-lg mx-auto leading-relaxed">
              输入研究主题，AI自动检索PubMed文献并生成学术综述
            </p>
          </div>

          {/* 输入区域 */}
          <div className="w-full max-w-2xl">
            <div className="flex gap-2">
              <Input
                placeholder="输入研究主题，如：lung cancer immunotherapy"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
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
            
            {/* 离线提示 */}
            {isOffline && (
              <Alert className="mt-4 bg-amber-50 border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-sm">
                  当前处于离线状态，请连接网络后使用。
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* 推荐主题 */}
          {appState === 'idle' && (
            <div className="mt-8 flex flex-wrap gap-2 justify-center max-w-lg">
              <span className="text-sm text-gray-400">热门主题：</span>
              {[
                'lung cancer immunotherapy',
                'COVID-19 vaccine',
                'diabetes treatment',
                'gene therapy',
                'CRISPR',
              ].map(t => (
                <button
                  key={t}
                  onClick={() => { setTopic(t); }}
                  className="text-sm px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 错误提示 */}
        {appState === 'error' && error && (
          <section className="px-4 pb-8">
            <div className="max-w-3xl mx-auto">
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <AlertDescription className="text-red-700 flex-1">
                  {error}
                </AlertDescription>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="ml-2"
                >
                  <RotateCw className="w-4 h-4 mr-1" />
                  重试
                </Button>
              </Alert>
            </div>
          </section>
        )}

        {/* 文献检索结果 */}
        {(appState === 'searching' || appState === 'selecting' || appState === 'generating') && (
          <section className="px-4 pb-16" ref={reviewRef}>
            <div className="max-w-3xl mx-auto">
              {/* 状态标题 */}
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

              {/* 骨架屏 or 文献列表 */}
              {appState === 'searching' ? (
                renderSkeletons()
              ) : (
                <>
                  {/* 全选按钮 */}
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

                  {/* 文献卡片列表 */}
                  <div className="space-y-3">
                    {articles.map((article, index) => (
                      <div
                        key={article.uid}
                        className="bg-white border border-gray-100 rounded-xl p-5 hover:border-blue-200 transition-all hover:shadow-sm"
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
                            {/* 标题 */}
                            <h3 className="font-medium text-blue-600 hover:underline cursor-pointer mb-1.5 leading-snug"
                              onClick={() => window.open(article.url, '_blank')}
                            >
                              {article.title}
                              <ExternalLink className="w-3 h-3 inline ml-1 opacity-50" />
                            </h3>
                            
                            {/* 作者、期刊、年份 */}
                            <p className="text-sm text-gray-500 mb-2">
                              {article.authors.length > 0 ? `${article.authors.join(', ')} 等 · ` : ''}
                              <span className="text-gray-600">{article.journal}</span>
                              {' · '}
                              <span className="text-gray-400">{article.year}</span>
                            </p>

                            {/* 摘要（可展开） */}
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

                            {/* 序号标签 */}
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

        {/* 综述展示与编辑 */}
        {(appState === 'review' || appState === 'editing') && review && (
          <section className="px-4 pb-16" ref={editRef}>
            <div className="max-w-3xl mx-auto">
              {/* 综述标题 */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h2 className="text-xl font-semibold text-[#1A1A2E]">AI生成综述</h2>
                </div>
                <h1 className="text-2xl font-bold text-[#1A1A2E] leading-snug">
                  {review.title}
                </h1>
              </div>

              {/* 操作栏 */}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="border-gray-200"
                >
                  {copied ? (
                    <Check className="w-4 h-4 mr-1.5 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1.5" />
                  )}
                  {copied ? '已复制' : '复制全文'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="border-gray-200"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  导出Markdown
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="border-gray-200 text-gray-500"
                >
                  <RotateCw className="w-4 h-4 mr-1.5" />
                  重新检索
                </Button>
              </div>

              {/* 编辑模式 */}
              {appState === 'editing' ? (
                <Textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="min-h-[600px] font-mono text-sm leading-relaxed p-5 border-gray-200 focus:border-blue-600 focus:ring-blue-200 resize-y"
                />
              ) : (
                /* 预览模式 */
                <div className="bg-white border border-gray-100 rounded-xl p-6 md:p-8 space-y-6">
                  {/* 摘要 */}
                  <div>
                    <h3 className="text-lg font-semibold text-[#1A1A2E] mb-3">摘要</h3>
                    <p className="text-gray-700 leading-relaxed">{review.abstract}</p>
                  </div>

                  {/* 正文 */}
                  {review.sections.map((section, i) => (
                    <div key={i}>
                      <h3 className="text-lg font-semibold text-[#1A1A2E] mb-3">
                        {section.title}
                      </h3>
                      <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {section.content}
                      </div>
                    </div>
                  ))}

                  {/* 参考文献 */}
                  <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-lg font-semibold text-[#1A1A2E] mb-4">参考文献</h3>
                    <ol className="space-y-2">
                      {review.references.map((ref, i) => (
                        <li key={i} className="text-sm text-gray-600 leading-relaxed pl-2">
                          <span className="text-blue-600 font-medium mr-1">[{i + 1}]</span>
                          {ref.replace(/^\[\d+\]\s*/, '')}
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

      {/* 底部 */}
      <footer className="border-t border-gray-100 py-6 px-4">
        <div className="max-w-3xl mx-auto text-center text-sm text-gray-400">
          <p>文献数据来源于 PubMed 数据库 · 综述内容由 AI 辅助生成，仅供参考</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
