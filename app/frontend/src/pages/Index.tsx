import { useEffect, useRef, useState } from 'react';
import { createClient } from '@metagptx/web-sdk';
import { toast } from 'sonner';
import { ArrowUp, Check, Code2, Copy, Download, Eye, Loader2, LogIn, Pencil, Plus, RotateCcw, Share2, Terminal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const client = createClient();
const MODEL = 'claude-opus-4.6';

type Project = { id: number; name: string; prompt?: string };
type Version = { id: number; project_id: number; instruction?: string; code: string; summary?: string };
type AuthState = 'loading' | 'in' | 'out';

const EXAMPLES = ['带分类和图表的个人记账本', '番茄钟 + 待办清单', '可玩的贪吃蛇小游戏', '咖啡店落地页，含菜单和预约表单'];

const SYSTEM = `你是资深前端工程师。根据用户需求生成一个完整、可直接运行的单文件 HTML 应用。
规则：
1. 只输出一个 \`\`\`html 代码块，前面可以有一句中文说明（不超过 40 字）。
2. 所有 CSS/JS 内联；可通过 CDN 引入 Tailwind（https://cdn.tailwindcss.com）。
3. 功能必须真实可交互，数据用 localStorage 持久化，不要占位文字。
4. 界面美观、响应式、中文界面。
5. 修改请求时，基于给出的现有代码输出修改后的完整文件。`;

function extractHtml(text: string): string {
  const m = text.match(/```html\s*([\s\S]*?)(```|$)/i);
  return (m ? m[1] : text).trim();
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="2.5" y="2.5" width="25" height="25" rx="7" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <path d="M9 19l4-8 4 8" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="10" r="2.6" fill="hsl(var(--accent))" />
    </svg>
  );
}

export default function Index() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersion, setActiveVersion] = useState<Version | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const pending = useRef('');

  useEffect(() => {
    client.auth.me().then((r) => setAuth(r?.data ? 'in' : 'out')).catch(() => setAuth('out'));
  }, []);

  useEffect(() => {
    if (auth !== 'in') return;
    client.entities.projects
      .query({ sort: '-created_at', limit: 50 })
      .then((r) => setProjects(r.data.items))
      .catch(() => toast.error('项目列表加载失败'));
  }, [auth]);

  const openProject = async (p: Project) => {
    setCurrent(p);
    setStream('');
    setShareUrl('');
    try {
      const r = await client.entities.versions.query({ query: { project_id: p.id }, sort: 'created_at', limit: 100 });
      const items: Version[] = r.data.items;
      setVersions(items);
      setActiveVersion(items[items.length - 1] ?? null);
    } catch {
      toast.error('版本加载失败');
    }
  };

  const newProject = () => {
    setCurrent(null);
    setVersions([]);
    setActiveVersion(null);
    setStream('');
    setShareUrl('');
  };

  const generate = async (text: string) => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    if (auth !== 'in') {
      client.auth.toLogin();
      return;
    }
    setBusy(true);
    setStream('');
    setTab('preview');
    pending.current = '';
    const base = activeVersion?.code;
    const userMsg = base
      ? `现有代码：\n\`\`\`html\n${base}\n\`\`\`\n\n修改需求：${instruction}`
      : `需求：${instruction}`;

    const finish = async (full: string) => {
      const code = extractHtml(full);
      if (!code.includes('<')) {
        toast.error('生成结果无效，请重试');
        setBusy(false);
        return;
      }
      const summary = full.split('```')[0].trim().slice(0, 120) || '已生成';
      try {
        let project = current;
        if (!project) {
          const r = await client.entities.projects.create({ data: { name: instruction.slice(0, 30), prompt: instruction } });
          project = r.data as Project;
          setProjects((ps) => [project as Project, ...ps]);
          setCurrent(project);
        }
        const v = await client.entities.versions.create({
          data: { project_id: project.id, instruction, code, summary },
        });
        setVersions((vs) => [...vs, v.data]);
        setActiveVersion(v.data);
        setInput('');
      } catch {
        toast.error('保存失败，请重试');
      } finally {
        setStream('');
        setBusy(false);
      }
    };

    try {
      await client.ai.gentxt({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
        onChunk: (c: { content?: string }) => {
          pending.current += c.content ?? '';
          setStream(pending.current);
        },
        onComplete: (r: { content?: string }) => {
          void finish(r?.content || pending.current);
        },
        onError: (e: { message?: string }) => {
          setBusy(false);
          setStream('');
          toast.error(e?.message || '生成失败，请重试');
        },
      });
    } catch (e: unknown) {
      setBusy(false);
      setStream('');
      toast.error((e as Error)?.message || '生成失败，请重试');
    }
  };

  const removeProject = async (p: Project) => {
    try {
      const r = await client.entities.versions.query({ query: { project_id: p.id }, limit: 100 });
      await Promise.all(r.data.items.map((v: Version) => client.entities.versions.delete({ id: String(v.id) })));
      await client.entities.projects.delete({ id: String(p.id) });
      setProjects((ps) => ps.filter((x) => x.id !== p.id));
      if (current?.id === p.id) newProject();
    } catch {
      toast.error('删除失败');
    }
  };

  const renameProject = async () => {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!current || !name || name === current.name) return;
    try {
      await client.entities.projects.update({ id: String(current.id), data: { name } });
      setCurrent({ ...current, name });
      setProjects((ps) => ps.map((x) => (x.id === current.id ? { ...x, name } : x)));
    } catch {
      toast.error('重命名失败');
    }
  };

  const publishShare = async () => {
    if (!activeVersion || sharing) return;
    setSharing(true);
    try {
      const r = await client.entities.shares.create({
        data: {
          title: current?.name || '未命名应用',
          code: activeVersion.code,
          project_id: activeVersion.project_id,
          views: 0,
        },
      });
      const url = `${window.location.origin}/s/${r.data.id}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success('分享链接已生成并复制到剪贴板');
      } catch {
        toast.success('分享链接已生成');
      }
    } catch {
      toast.error('发布失败，请重试');
    } finally {
      setSharing(false);
    }
  };

  const copyCode = async () => {
    if (!activeVersion) return;
    try {
      await navigator.clipboard.writeText(activeVersion.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('复制失败，请手动选择代码');
    }
  };

  const download = () => {
    if (!activeVersion) return;
    const blob = new Blob([activeVersion.code], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current?.name || 'app'}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void generate(input);
      }}
      className="tech-glow rounded-2xl border border-primary/30 bg-card/90 p-4 backdrop-blur"
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wide text-primary">
        <Terminal className="h-3.5 w-3.5" /> 输入你的想法
      </div>
      <label htmlFor="prompt" className="sr-only">描述你想要的应用</label>
      <textarea
        id="prompt"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void generate(input);
          }
        }}
        rows={current ? 2 : 3}
        disabled={busy}
        placeholder={current ? '继续描述修改，例如：把主色换成绿色，并增加导出功能' : '描述你想要的应用，例如：一个支持分类统计的记账本，带月度饼图'}
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</span>
        <button
          type="submit"
          aria-label="生成"
          disabled={busy || !input.trim()}
          className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );

  const header = (
    <header className="mx-auto flex h-16 max-w-[1400px] items-center justify-between border-b border-border/60 px-5">
      <button onClick={newProject} className="flex items-center gap-2.5" aria-label="返回首页">
        <Logo />
        <span className="font-display text-base font-bold tracking-tight">Atoms Demo</span>
      </button>
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" />
          引擎在线 · {MODEL}
        </span>
        {auth === 'out' && (
          <Button onClick={() => client.auth.toLogin()} className="rounded-lg font-medium">
            <LogIn className="mr-1 h-4 w-4" /> 登录开始创作
          </Button>
        )}
      </div>
    </header>
  );

  const showWorkspace = current || busy;

  if (!showWorkspace) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <a href="#main" className="sr-only focus:not-sr-only">跳到主要内容</a>
        {header}
        <main id="main" className="relative">
          <section className="tech-grid scanline relative overflow-hidden border-b border-border/60 px-5 py-20 md:py-28">
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, hsl(175 95% 50% / 0.16), transparent 70%)' }}
            />
            <div className="relative mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium tracking-wide text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> AI 代码引擎 · 已就绪
              </p>
              <h1 className="mt-6 font-display text-[40px] font-extrabold leading-[1.08] md:text-[64px]" style={{ textWrap: 'balance' }}>
                把想法变成<span className="text-primary">可运行的应用</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                用一句话描述需求，AI 实时生成完整可运行的代码。对话即迭代，每个版本自动存档，随时回滚与导出。
              </p>
              <div className="mt-10 text-left">{composer}</div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="rounded-md border border-border bg-card/60 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-[1200px] px-5 py-16">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['01', '输入', '描述需求', '用中文写下你想要的功能和风格，引擎解析为结构化指令。'],
                ['02', '生成', '自动生成', 'AI 输出完整的单文件网页应用，构建过程逐字符可见。'],
                ['03', '迭代', '对话迭代', '在预览旁继续提修改，版本自动存档，可回滚、可导出。'],
              ].map(([n, tag, t, d]) => (
                <div key={n} className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
                  <div className="flex items-center justify-between text-[11px] font-medium tracking-wide text-primary">
                    <span>{tag}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </div>
                  <h2 className="mt-4 font-display text-lg font-bold">{t}</h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['< 60s', '平均构建耗时'],
                ['100%', '可运行代码，非伪代码'],
                ['∞', '版本存档与回滚次数'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl border border-border bg-card px-5 py-6 text-center">
                  <p className="font-display text-3xl font-extrabold tabular-nums">{v}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            {auth === 'in' && (
              <section className="mt-16">
                <h2 className="font-display text-2xl font-bold tracking-tight">我的项目</h2>
                {projects.length === 0 ? (
                  <p className="mt-4 font-mono text-sm text-muted-foreground">还没有项目，在上方输入第一个想法吧。</p>
                ) : (
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                        <button onClick={() => openProject(p)} className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary">
                          {p.name}
                        </button>
                        <button aria-label={`删除 ${p.name}`} onClick={() => removeProject(p)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </section>
        </main>
      </div>
    );
  }

  const liveCode = stream ? extractHtml(stream) : activeVersion?.code || '';

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {header}
      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex min-h-0 flex-col rounded-xl border border-border bg-card lg:w-[380px]">
          <div className="flex items-center justify-between border-b border-border p-4">
            {renaming ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={renameProject}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameProject();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                aria-label="项目名称"
                className="min-w-0 flex-1 rounded-md border border-primary/50 bg-background px-2 py-1 text-sm outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  if (!current) return;
                  setNameDraft(current.name);
                  setRenaming(true);
                }}
                className="group flex min-w-0 items-center gap-1.5"
                aria-label="重命名项目"
              >
                <span className="truncate font-display text-sm font-semibold">{current?.name || '新项目'}</span>
                {current && <Pencil className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />}
              </button>
            )}
            <Button variant="outline" size="sm" className="rounded-lg !bg-transparent" onClick={newProject}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 新建
            </Button>
          </div>
          <ol className="flex-1 space-y-3 overflow-y-auto p-4">
            {versions.map((v, i) => (
              <li key={v.id} className="space-y-2">
                <div className="ml-8 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{v.instruction}</div>
                <div className="mr-8 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <p className="text-muted-foreground">{v.summary}</p>
                  <button
                    onClick={() => setActiveVersion(v)}
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary"
                  >
                    {activeVersion?.id === v.id ? (
                      <><span className="h-1.5 w-1.5 rounded-full bg-primary" /> 当前版本 v{i + 1}</>
                    ) : (
                      <><RotateCcw className="h-3 w-3" /> 回滚到 v{i + 1}</>
                    )}
                  </button>
                </div>
              </li>
            ))}
            {busy && (
              <li className="flex items-center gap-2 font-mono text-xs text-primary">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在生成… {stream.length} 字符
              </li>
            )}
          </ol>
          <div className="border-t border-border p-3">{composer}</div>
        </aside>

        <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex gap-1" role="tablist">
              {(['preview', 'code'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t === 'preview' ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                  {t === 'preview' ? '预览' : '代码'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="rounded-lg !bg-transparent" disabled={!activeVersion} onClick={copyCode}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制代码'}
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg !bg-transparent" disabled={!activeVersion} onClick={download}>
                <Download className="mr-1 h-3.5 w-3.5" /> 下载
              </Button>
              <Button size="sm" className="rounded-lg" disabled={!activeVersion || sharing} onClick={publishShare}>
                {sharing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1 h-3.5 w-3.5" />}
                发布分享
              </Button>
            </div>
          </div>
          {shareUrl && (
            <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-3 py-2">
              <span className="shrink-0 text-xs text-muted-foreground">公开链接</span>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs text-primary hover:underline">
                {shareUrl}
              </a>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl).then(() => toast.success('已复制'));
                }}
                className="shrink-0 text-xs text-muted-foreground hover:text-primary"
              >
                复制
              </button>
            </div>
          )}
          {tab === 'preview' && !busy ? (
            liveCode ? (
              <iframe title="应用预览" srcDoc={liveCode} sandbox="allow-scripts allow-forms allow-modals" className="flex-1 bg-white" />
            ) : (
              <div className="grid flex-1 place-items-center font-mono text-sm text-muted-foreground">暂无版本</div>
            )
          ) : (
            <pre className="flex-1 overflow-auto bg-[hsl(240_6%_4%)] p-4 font-mono text-xs leading-relaxed text-foreground">
              {liveCode || '// 等待生成…'}
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
