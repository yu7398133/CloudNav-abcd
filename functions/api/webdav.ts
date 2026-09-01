
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
    const fileUrl = baseUrl + finalFilename;

    const authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    
    let fetchUrl = baseUrl;
    let method = 'HEAD';
    let headers: Record<string, string> = {
        'Authorization': authHeader,
        'User-Agent': 'CloudNav/1.0'
    };
    let requestBody: string | undefined = undefined;

    if (operation === 'check') {
        // Use HEAD instead of PROPFIND — Cloudflare Workers fetch does not support PROPFIND
        fetchUrl = baseUrl;
        method = 'HEAD';
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

    const response = await fetch(fetchUrl, {
        method,
        headers,
        body: requestBody
    });

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

    // For check: 2xx means auth worked and path is accessible
    // For upload: 2xx / 201 / 204 means success
    const success = response.ok;
    
    if (!success) {
        let errorMsg = 'WebDAV 操作失败';
        if (response.status === 401) {
            errorMsg = '认证失败，请检查用户名和应用密码';
        } else if (response.status === 403) {
            errorMsg = '权限不足，请检查 WebDAV 权限设置';
        } else if (response.status === 404) {
            errorMsg = '路径不存在，请检查 WebDAV 服务器地址';
        } else {
            errorMsg = `WebDAV 错误: ${response.status} ${response.statusText}`;
        }
        return new Response(JSON.stringify({ success: false, status: response.status, error: errorMsg }), { 
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
