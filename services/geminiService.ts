import { AIConfig } from "../types";

/**
 * Helper to call Gemini REST API directly (no SDK dependency)
 */
const callGeminiAPI = async (apiKey: string, model: string, prompt: string): Promise<string> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Gemini API Error:", response.status, err);
        throw new Error(`Gemini API ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
};

/**
 * Helper to call OpenAI Compatible API
 */
const callOpenAICompatible = async (config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> => {
    let baseUrl = config.baseUrl.replace(/\/$/, '');
    if (!baseUrl.includes('/chat/completions')) {
        if (baseUrl.endsWith('/v1')) {
            baseUrl += '/chat/completions';
        } else {
            baseUrl += '/chat/completions';
        }
    }

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("OpenAI API Error:", response.status, err);
        throw new Error(`API ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
};

/**
 * Unified AI call function
 */
const callAI = async (config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> => {
    if (config.provider === 'gemini') {
        const model = config.model || 'gemini-2.5-flash';
        return await callGeminiAPI(config.apiKey, model, `${systemPrompt}\n\n${userPrompt}`);
    } else {
        return await callOpenAICompatible(config, systemPrompt, userPrompt);
    }
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
