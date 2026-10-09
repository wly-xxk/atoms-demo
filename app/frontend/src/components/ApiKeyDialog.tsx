import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  clearSettings,
  DEFAULT_SETTINGS,
  getProvider,
  LlmSettings,
  PROVIDERS,
  saveSettings,
  testConnection,
} from '@/lib/llm';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: LlmSettings;
  onSaved: (s: LlmSettings) => void;
};

const field =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function ApiKeyDialog({ open, onOpenChange, value, onSaved }: Props) {
  const [draft, setDraft] = useState<LlmSettings>(value);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const provider = getProvider(draft.provider);
  const valid = draft.apiKey.trim() && draft.baseUrl.trim() && draft.model.trim();

  const pickProvider = (id: string) => {
    const p = getProvider(id);
    setDraft({
      provider: id,
      apiKey: draft.apiKey,
      baseUrl: p.baseUrl,
      model: p.models[0] ?? '',
    });
  };

  const save = () => {
    if (!valid) return;
    saveSettings(draft);
    onSaved(draft);
    onOpenChange(false);
    toast.success('设置已保存');
  };

  const test = async () => {
    if (!valid) return;
    setTesting(true);
    try {
      await testConnection(draft);
      toast.success('连接成功，配置可用');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const clear = () => {
    clearSettings();
    onSaved(DEFAULT_SETTINGS);
    setDraft(DEFAULT_SETTINGS);
    toast.success('已清除本地保存的配置');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>配置模型服务</DialogTitle>
          <DialogDescription>
            生成应用会使用你自己的 API Key 调用模型，费用由你的账户承担。配置仅保存在当前浏览器，不会上传到我们的服务器。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">选择平台</span>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProvider(p.id)}
                  aria-pressed={draft.provider === p.id}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    draft.provider === p.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {provider.note && <p className="text-xs text-muted-foreground">{provider.note}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="api-key" className="text-sm font-medium">API Key</label>
              {provider.keyUrl && (
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  获取 Key <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                id="api-key"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                placeholder={provider.keyHint}
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                className={`${field} pr-10 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? '隐藏 Key' : '显示 Key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="base-url" className="text-sm font-medium">接口地址</label>
            <input
              id="base-url"
              placeholder="https://your-service.com/v1"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              className={`${field} font-mono`}
            />
            <p className="text-xs text-muted-foreground">
              选择平台后已自动填好；服务需允许浏览器跨域访问。
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="model" className="text-sm font-medium">模型</label>
            <input
              id="model"
              list="model-options"
              placeholder="模型名称"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className={`${field} font-mono`}
            />
            <datalist id="model-options">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {provider.models.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {provider.models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, model: m })}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                      draft.model === m ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={clear} className="text-muted-foreground">清除配置</Button>
          <div className="flex gap-2">
            <Button variant="outline" className="!bg-transparent" disabled={!valid || testing} onClick={test}>
              {testing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 测试连接
            </Button>
            <Button disabled={!valid} onClick={save}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
