export type LlmSettings = { provider: string; apiKey: string; baseUrl: string; model: string };

export type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  keyHint: string;
  keyUrl?: string;
  note?: string;
};

/** 常见的 OpenAI 兼容平台预设，选择后自动填好接口地址与常用模型。 */
export const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '性价比高，适合日常生成。',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-coder-plus'],
    keyHint: 'sk-...',
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4-plus', 'glm-4-flash'],
    keyHint: '形如 xxx.yyy',
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'zai-org/GLM-4.6'],
    keyHint: 'sk-...',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '聚合多家开源模型，有免费额度。',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o-mini', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat'],
    keyHint: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
    note: '一个 Key 可调用 Claude、Gemini 等多家模型。',
  },
  {
    id: 'custom',
    name: '自定义（任何 OpenAI 兼容服务）',
    baseUrl: '',
    models: [],
    keyHint: '你的 API Key',
    note: '填写任何兼容 /chat/completions 的接口地址，需允许浏览器跨域访问。',
  },
];

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

const STORAGE_KEY = 'atoms-demo:llm-settings';

export const DEFAULT_SETTINGS: LlmSettings = {
  provider: 'openai',
  apiKey: '',
  baseUrl: PROVIDERS[0].baseUrl,
  model: PROVIDERS[0].models[0],
};

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: LlmSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

function endpoint(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const msg = j?.error?.message || j?.message;
    if (res.status === 401 || res.status === 403) return msg || 'API Key 无效或无权限，请在设置中检查';
    if (res.status === 429) return msg || '请求过于频繁或额度已用完（429）';
    if (res.status === 404) return msg || '模型或接口地址不存在，请检查设置（404）';
    return msg || `请求失败（${res.status}）`;
  } catch {
    return `请求失败（${res.status}）`;
  }
}

/** 流式调用 OpenAI 兼容的 Chat Completions 接口，返回完整文本。 */
export async function streamChat(
  settings: LlmSettings,
  messages: Message[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(endpoint(settings.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey.trim()}` },
      body: JSON.stringify({ model: settings.model.trim(), messages, stream: true }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('无法连接到接口地址，请检查网络或 Base URL（需支持浏览器跨域访问）');
  }
  if (!res.ok || !res.body) throw new Error(await readError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const delta: string = JSON.parse(data)?.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        /* 忽略不完整的行 */
      }
    }
  }
  return full;
}

/** 发送一次极小请求，用于验证 Key、地址和模型是否可用。 */
export async function testConnection(settings: LlmSettings): Promise<void> {
  const res = await fetch(endpoint(settings.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey.trim()}` },
    body: JSON.stringify({ model: settings.model.trim(), messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
  }).catch(() => {
    throw new Error('无法连接到接口地址，请检查网络或 Base URL');
  });
  if (!res.ok) throw new Error(await readError(res));
}
