interface Env {
  CLOUDNAV_KV: any;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
};

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const onRequestPost = async (context: { env: Env; request: Request }) => {
  try {
    const { request } = context;
    const body = await request.json() as {
      provider: string;
      apiKey: string;
      baseUrl?: string;
      model: string;
      systemPrompt: string;
      userPrompt: string;
    };

    const { provider, apiKey, baseUrl, model, systemPrompt, userPrompt } = body;

    if (!apiKey || !model) {
      return new Response(JSON.stringify({ error: 'Missing apiKey or model' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let result = '';

    if (provider === 'gemini') {
      // Call Gemini REST API
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        })
      });

      if (!resp.ok) {
        const err = await resp.text();
        return new Response(JSON.stringify({ error: `Gemini API ${resp.status}: ${err.substring(0, 300)}` }), {
          status: resp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await resp.json() as any;
      result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
      // OpenAI Compatible
      let apiBase = (baseUrl || '').replace(/\/$/, '');
      if (!apiBase.includes('/chat/completions')) {
        apiBase += apiBase.endsWith('/v1') ? '/chat/completions' : '/chat/completions';
      }

      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      if (!resp.ok) {
        const err = await resp.text();
        return new Response(JSON.stringify({ error: `API ${resp.status}: ${err.substring(0, 300)}` }), {
          status: resp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await resp.json() as any;
      result = data.choices?.[0]?.message?.content?.trim() || '';
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
