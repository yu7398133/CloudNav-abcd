
import { Category, LinkItem, WebDavConfig, SearchConfig, AIConfig } from "../types";

// Helper to call our Cloudflare Proxy
// This solves the CORS issue by delegating the request to the backend
const callWebDavProxy = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any, filename?: string) => {
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
        
        if (!response.ok) {
            console.error(`WebDAV Proxy Error: ${response.status}`, data);
            // Return the error info so callers can display it
            return { success: false, error: data?.error || `HTTP ${response.status}` };
        }
        
        return data;
    } catch (e: any) {
        console.error("WebDAV Proxy Network Error", e);
        return { success: false, error: `网络错误: ${e.message}` };
    }
}

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
