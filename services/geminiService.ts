import { AIConfig } from "../types";

/**
 * Call AI via backend proxy (avoids CORS issues)
 */
const callAI = async (config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> => {
    const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: config.provider,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model || (config.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-3.5-turbo'),
            systemPrompt,
            userPrompt
        })
    });

    const data = await resp.json() as { result?: string; error?: string };

    if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data.result || '';
};

/**
 * Uses configured AI to generate a description
 */
export const generateLinkDescription = async (title: string, url: string, config: AIConfig): Promise<string> => {
  if (!config.apiKey) {
    return "请在设置中配置 API Key";
  }

  const prompt = `Title: ${title}\nURL: ${url}\nPlease write a very short description (max 15 words) in Chinese (Simplified) that explains what this website is for. Return ONLY the description text. No quotes.`;

  try {
    const result = await callAI(
        config,
        "You are a helpful assistant that summarizes website bookmarks.",
        prompt
    );
    return result || "生成描述失败：AI 返回为空";
  } catch (error: any) {
    console.error("AI generation error:", error);
    return `生成描述失败：${error.message || '未知错误'}`;
  }
};

/**
 * Suggests a category
 */
export const suggestCategory = async (title: string, url: string, categories: {id: string, name: string}[], config: AIConfig): Promise<string | null> => {
    if (!config.apiKey) return null;

    const catList = categories.map(c => `${c.id}: ${c.name}`).join('\n');
    const prompt = `Website: "${title}" (${url})\n\nAvailable Categories:\n${catList}\n\nReturn ONLY the 'id' of the best matching category. If unsure, return 'common'.`;

    try {
        const result = await callAI(
            config,
            "You are an intelligent classification assistant. You only output the category ID.",
            prompt
        );
        return result || null;
    } catch (e) {
        console.error("Category suggestion error:", e);
        return null;
    }
};
