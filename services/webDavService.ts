
import { Category, LinkItem, WebDavConfig, SearchConfig, AIConfig } from "../types";

// Encode URL path segments for WebDAV compatibility
function encodeWebDavUrl(url: string): string {
    try {
        const u = new URL(url);
        u.pathname = u.pathname.split('/').map(segment => {
            if (!segment) return segment;
            if (/^%[0-9A-Fa-f]{2}/.test(segment)) return segment;
            return encodeURIComponent(segment);
        }).join('/');
        return u.toString();
    } catch {
        return url;
    }
}

// Direct WebDAV request from browser (bypasses Cloudflare Workers proxy)
// This works when the WebDAV server supports CORS or when accessed from the same origin
const directWebDavRequest = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any, filename?: string): Promise<any> => {
    let baseUrl = config.url.trim();
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    const finalFilename = filename || 'cloudnav_backup.json';
    const fileUrl = encodeWebDavUrl(baseUrl + finalFilename);
    
    const authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    
    let fetchUrl = fileUrl;
    let method = 'GET';
    let headers: Record<string, string> = {
        'Authorization': authHeader,
        'User-Agent': 'CloudNav/2.0',
        'Accept': '*/*',
    };
    let body: string | undefined = undefined;

    if (operation === 'check') {
        // Use PROPFIND to check directory access
        fetchUrl = encodeWebDavUrl(baseUrl);
        method = 'PROPFIND';
        headers['Depth'] = '0';
        body = '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>';
    } else if (operation === 'upload') {
        method = 'PUT';
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
    }

    try {
        const response = await fetch(fetchUrl, {
            method,
            headers,
            body,
            mode: 'cors',
        });

        if (operation === 'download') {
            if (!response.ok) {
                if (response.status === 404) {
                    return { success: false, error: '备份文件不存在，请先上传备份' };
                }
                return { success: false, error: `WebDAV 错误: ${response.status}` };
            }
            return await response.json();
        }

        if (operation === 'check') {
            // PROPFIND 207 or GET 200/404 = connection OK
            if (response.status === 207 || response.ok || response.status === 404) {
                return { success: true, status: response.status };
            }
            return { success: false, error: `WebDAV 错误: ${response.status}`, status: response.status };
        }

        // upload
        if (response.ok) {
            return { success: true, status: response.status };
        }
        return { success: false, error: `WebDAV 错误: ${response.status}`, status: response.status };
    } catch (e: any) {
        return { success: false, error: `前端直连失败: ${e.message}` };
    }
};

// Helper to call our Cloudflare Proxy with fallback to direct connection
const callWebDavProxy = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any, filename?: string) => {
    // Strategy 1: Try backend proxy
    try {
        const response = await fetch('/api/webdav', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation,
                config,
                payload,
                filename
            })
        });
        
        const data = await response.json().catch(() => null);
        
        if (response.ok && data?.success) {
            return data;
        }
        
        // If backend proxy returned 520 (CF Workers can't reach WebDAV), try direct
        if (data?.status === 520 || data?.hint === 'jianguoyun_blocked' || response.status === 520) {
            console.log('Backend proxy failed (likely CF Workers issue), trying direct connection...');
            return await directWebDavRequest(operation, config, payload, filename);
        }
        
        // For other errors, return the backend error
        if (!response.ok) {
            return { success: false, error: data?.error || `HTTP ${response.status}` };
        }
        return data;
    } catch (e: any) {
        // Network error reaching backend, try direct connection
        console.log('Backend proxy unreachable, trying direct connection...');
        return await directWebDavRequest(operation, config, payload, filename);
    }
};

export const checkWebDavConnection = async (config: WebDavConfig): Promise<{ success: boolean; error?: string }> => {
    if (!config.url || !config.username || !config.password) return { success: false, error: '请填写完整的 WebDAV 配置' };
    const result = await callWebDavProxy('check', config);
    return { success: result?.success === true, error: result?.error };
};

export const uploadBackup = async (config: WebDavConfig, data: { links: LinkItem[], categories: Category[], searchConfig?: SearchConfig, aiConfig?: AIConfig }): Promise<{ success: boolean; error?: string }> => {
    const result = await callWebDavProxy('upload', config, data);
    return { success: result?.success === true, error: result?.error };
};

export const uploadBackupWithTimestamp = async (config: WebDavConfig, data: { links: LinkItem[], categories: Category[], searchConfig?: SearchConfig, aiConfig?: AIConfig }): Promise<{ success: boolean; filename: string; error?: string }> => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    const filename = `cloudnav_backup_${timestamp}.json`;
    const result = await callWebDavProxy('upload', config, data, filename);
    return { success: result?.success === true, filename, error: result?.error };
};

export const downloadBackup = async (config: WebDavConfig): Promise<{ links: LinkItem[], categories: Category[], searchConfig?: SearchConfig, aiConfig?: AIConfig } | null> => {
    const result = await callWebDavProxy('download', config);
    
    // Check if the result looks like valid backup data
    if (result && Array.isArray(result.links) && Array.isArray(result.categories)) {
        return result as { links: LinkItem[], categories: Category[], searchConfig?: SearchConfig, aiConfig?: AIConfig };
    }
    return null;
};
