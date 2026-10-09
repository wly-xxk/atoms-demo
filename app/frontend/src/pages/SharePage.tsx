import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@metagptx/web-sdk';
import { Code2, Eye, Loader2 } from 'lucide-react';

const client = createClient();

type Share = { id: number; title: string; code: string; views?: number };

export default function SharePage() {
  const { id } = useParams();
  const [share, setShare] = useState<Share | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [tab, setTab] = useState<'preview' | 'code'>('preview');

  useEffect(() => {
    if (!id) return;
    client.entities.shares
      .get({ id })
      .then(async (r) => {
        const data: Share = r.data;
        setShare(data);
        setState('ok');
        try {
          await client.entities.shares.update({ id, data: { views: (data.views ?? 0) + 1 } });
        } catch {
          /* 浏览量更新失败不影响展示 */
        }
      })
      .catch(() => setState('missing'));
  }, [id]);

  if (state === 'loading') {
    return (
      <div className="grid h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (state === 'missing' || !share) {
    return (
      <div className="grid h-screen place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <h1 className="font-display text-2xl font-bold">分享不存在或已被删除</h1>
          <p className="mt-2 text-muted-foreground">请确认链接是否完整。</p>
          <a href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            回到首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-5">
        <div className="min-w-0">
          <h1 className="truncate font-display text-sm font-semibold">{share.title}</h1>
          <p className="text-[11px] text-muted-foreground">由 Atoms Demo 生成 · {(share.views ?? 0) + 1} 次浏览</p>
        </div>
        <div className="flex items-center gap-1">
          {(['preview', 'code'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-selected={tab === t}
              role="tab"
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'preview' ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
              {t === 'preview' ? '预览' : '代码'}
            </button>
          ))}
          <a href="/" className="ml-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/50">
            我也要做一个
          </a>
        </div>
      </header>
      {tab === 'preview' ? (
        <iframe title={share.title} srcDoc={share.code} sandbox="allow-scripts allow-forms allow-modals" className="flex-1 bg-white" />
      ) : (
        <pre className="flex-1 overflow-auto bg-[hsl(240_6%_4%)] p-4 font-mono text-xs leading-relaxed">{share.code}</pre>
      )}
    </div>
  );
}
