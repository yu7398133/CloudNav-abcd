
// Encode URL path segments while preserving the scheme, host, and existing encoding
function encodeWebDavUrl(url: string): string {
    try {
        const u = new URL(url);
        // Split path by /, encode each segment, rejoin
        u.pathname = u.pathname.split('/').map(segment => {
            if (!segment) return segment;
            // Already percent-encoded? Keep as-is
            if (/^%[0-9A-Fa-f]{2}/.test(segment)) return segment;
            return encodeURIComponent(segment);
        }).join('/');
        return u.toString();
    } catch {
        return url;
    }
}

export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context;
  
  try {
    const body = await request.json() as any;
    const { operation, config, payload, filename } = body;
    
    if (!config || !config.url || !config.username || !config.password) {
        return new Response(JSON.stringify({ error: 'Missing configuration' }), { status: 400 });
    }

    let baseUrl = config.url.trim();
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    const finalFilename = filename || 'cloudnav_backup.json';
    const fileUrl = encodeWebDavUrl(baseUrl + finalFilename);

    const authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    
    let fetchUrl = fileUrl;
    let method = 'GET';
    let headers: Record<string, string> = {
        'Authorization': authHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CloudNav/2.0',
        'Accept': '*/*',
    };
    let requestBody: string | undefined = undefined;

    if (operation === 'check') {
        // Try GET on the backup file to verify connection
        // 200 = file exists, connection good
        // 404 = path reachable, no backup yet, still OK
        // 401/403 = auth failed
        fetchUrl = fileUrl;
        method = 'GET';
    } else if (operation === 'upload') {
        fetchUrl = fileUrl;
        method = 'PUT';
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(payload); 
    } else if (operation === 'download') {
        fetchUrl = fileUrl;
        method = 'GET';
    } else {
        return new Response(JSON.stringify({ error: 'Invalid operation' }), { status: 400 });
    }

    let response: Response;
    try {
        const fetchOptions: RequestInit = {
            method,
            headers,
            redirect: 'follow',
        };
        // Only include body for methods that support it
        if (requestBody && method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = requestBody;
        }
        response = await fetch(fetchUrl, fetchOptions);
    } catch (fetchErr: any) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: `WebDAV 网络请求失败: ${fetchErr.message}。如果使用坚果云，可能是 Cloudflare IP 被屏蔽，建议使用其他 WebDAV 服务（如 InfiniCLOUD、Yandex Disk）。`,
            hint: 'jianguoyun_blocked'
        }), { status: 520, headers: { 'Content-Type': 'application/json' } });
    }

    if (operation === 'download') {
        if (!response.ok) {
             if (response.status === 404) {
                 return new Response(JSON.stringify({ error: '备份文件不存在，请先上传备份' }), { status: 404 });
             }
             return new Response(JSON.stringify({ error: `WebDAV 错误: ${response.status} ${response.statusText}` }), { status: response.status });
        }
        const data = await response.json();
        return new Response(JSON.stringify(data), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    // For check: treat 200 (file exists) and 404 (no backup yet) as success
    // Only auth errors (401/403) or server errors are real failures
    if (operation === 'check') {
        if (response.ok || response.status === 404) {
            return new Response(JSON.stringify({ success: true, status: response.status }), { 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
    }

    const success = response.ok;
    
    if (!success) {
        let errorMsg = 'WebDAV 操作失败';
        let hint = '';
        if (response.status === 401) {
            errorMsg = '认证失败，请检查用户名和应用密码';
        } else if (response.status === 403) {
            errorMsg = '权限不足，请检查 WebDAV 权限设置';
        } else if (response.status === 404) {
            errorMsg = '路径不存在，请检查 WebDAV 服务器地址';
        } else if (response.status === 520 || response.status === 521 || response.status === 522 || response.status === 523) {
            errorMsg = '无法连接到 WebDAV 服务器。如果使用坚果云(jianguoyun)，可能是 Cloudflare IP 被屏蔽。建议：1) 使用其他 WebDAV 服务（如 Yandex Disk、InfiniCLOUD）；2) 使用自带 WebDAV 服务器。';
            hint = 'jianguoyun_likely_blocked';
        } else {
            errorMsg = `WebDAV 错误: ${response.status} ${response.statusText}`;
        }
        return new Response(JSON.stringify({ success: false, status: response.status, error: errorMsg, hint }), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
    
    return new Response(JSON.stringify({ success: true, status: response.status }), { 
        headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: `WebDAV 请求异常: ${err.message}` }), { status: 500 });
  }
};
