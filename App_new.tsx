
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, Upload, Moon, Sun, Menu, 
  Trash2, Edit2, Loader2, Cloud, CheckCircle2, AlertCircle,
  Pin, Settings, Lock, CloudCog, Github, GitFork, GripVertical, Save, CheckSquare, LogOut, ExternalLink, X
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS, WebDavConfig, AIConfig, SearchMode, ExternalSearchSource, SearchConfig } from './types';
import { parseBookmarks } from './services/bookmarkParser';
import Icon from './components/Icon';
import LinkModal from './components/LinkModal';
import AuthModal from './components/AuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import BackupModal from './components/BackupModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';
import SearchConfigModal from './components/SearchConfigModal';
import ContextMenu from './components/ContextMenu';
import QRCodeModal from './components/QRCodeModal';

// --- 配置�?---
// 项目核心仓库地址
const GITHUB_REPO_URL = 'https://github.com/aabacada/CloudNav-abcd';

const LOCAL_STORAGE_KEY = 'cloudnav_data_cache';
const AUTH_KEY = 'cloudnav_auth_token';
const WEBDAV_CONFIG_KEY = 'cloudnav_webdav_config';
const AI_CONFIG_KEY = 'cloudnav_ai_config';
const SEARCH_CONFIG_KEY = 'cloudnav_search_config';

function App() {
  // --- State ---
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Search Mode State
  const [searchMode, setSearchMode] = useState<SearchMode>('external');
  const [externalSearchSources, setExternalSearchSources] = useState<ExternalSearchSource[]>([]);
  const [isLoadingSearchConfig, setIsLoadingSearchConfig] = useState(true);
  
  // Category Security State
  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());

  // WebDAV Config State
  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
      url: '',
      username: '',
      password: '',
      enabled: false
  });

  // AI Config State
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      return {
          provider: 'gemini',
          apiKey: process.env.API_KEY || '', 
          baseUrl: '',
          model: 'gemini-2.5-flash'
      };
  });

  // Site Settings State
  const [siteSettings, setSiteSettings] = useState(() => {
      const saved = localStorage.getItem('cloudnav_site_settings');
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      return {
          title: 'CloudNav - 我的导航',
          navTitle: 'CloudNav',
          favicon: '',
          cardStyle: 'detailed' as const,
          passwordExpiryDays: 7
      };
  });
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSearchConfigModalOpen, setIsSearchConfigModalOpen] = useState(false);
  const [catAuthModalData, setCatAuthModalData] = useState<Category | null>(null);
  
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  // State for data pre-filled from Bookmarklet
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);
  
  // Sync State
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authToken, setAuthToken] = useState<string>('');
  const [requiresAuth, setRequiresAuth] = useState<boolean | null>(null); // null表示未检查，true表示需要认证，false表示不需�?
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Sort State
  const [isSortingMode, setIsSortingMode] = useState<string | null>(null); // 存储正在排序的分类ID，null表示不在排序模式
  const [isSortingPinned, setIsSortingPinned] = useState(false); // 是否正在排序置顶链接
  
  // Batch Edit State
  const [isBatchEditMode, setIsBatchEditMode] = useState(false); // 是否处于批量编辑模式
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set()); // 选中的链接ID集合
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    link: LinkItem | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    link: null
  });
  
  // QR Code Modal State
  const [qrCodeModal, setQrCodeModal] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
  }>({
    isOpen: false,
    url: '',
    title: ''
  });

  // Mobile Search State
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
  // Category Action Auth State
  const [categoryActionAuth, setCategoryActionAuth] = useState<{
    isOpen: boolean;
    action: 'edit' | 'delete';
    categoryId: string;
    categoryName: string;
  }>({
    isOpen: false,
    action: 'edit',
    categoryId: '',
    categoryName: ''
  });
  
  // --- Helpers & Sync Logic ---

  const loadFromLocal = () => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        let loadedCategories = parsed.categories || DEFAULT_CATEGORIES;
        
        // 确保"常用推荐"分类始终存在，并确保它是第一个分�?
        if (!loadedCategories.some(c => c.id === 'common')) {
          loadedCategories = [
            { id: 'common', name: '常用推荐', icon: 'Star' },
            ...loadedCategories
          ];
        } else {
          // 如果"常用推荐"分类已存在，确保它是第一个分�?
          const commonIndex = loadedCategories.findIndex(c => c.id === 'common');
          if (commonIndex > 0) {
            const commonCategory = loadedCategories[commonIndex];
            loadedCategories = [
              commonCategory,
              ...loadedCategories.slice(0, commonIndex),
              ...loadedCategories.slice(commonIndex + 1)
            ];
          }
        }
        
        // 检查是否有链接的categoryId不存在于当前分类中，将这些链接移动到"常用推荐"
        const validCategoryIds = new Set(loadedCategories.map(c => c.id));
        let loadedLinks = parsed.links || INITIAL_LINKS;
        loadedLinks = loadedLinks.map(link => {
          if (!validCategoryIds.has(link.categoryId)) {
            return { ...link, categoryId: 'common' };
          }
          return link;
        });
        
        setLinks(loadedLinks);
        setCategories(loadedCategories);
      } catch (e) {
        setLinks(INITIAL_LINKS);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const syncToCloud = async (newLinks: LinkItem[], newCategories: Category[], token: string) => {
    setSyncStatus('saving');
    try {
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': token
            },
            body: JSON.stringify({ links: newLinks, categories: newCategories })
        });

        if (response.status === 401) {
            // 检查是否是密码过期
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.includes('过期')) {
                    alert('您的密码已过期，请重新登�?);
                }
            } catch (e) {
                // 如果无法解析错误信息，使用默认提�?
                console.error('Failed to parse error response', e);
            }
            
            setAuthToken('');
            localStorage.removeItem(AUTH_KEY);
            setIsAuthOpen(true);
            setSyncStatus('error');
            return false;
        }

        if (!response.ok) throw new Error('Network response was not ok');
        
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
        return true;
    } catch (error) {
        console.error("Sync failed", error);
        setSyncStatus('error');
        return false;
    }
  };

  const updateData = (newLinks: LinkItem[], newCategories: Category[]) => {
      // 1. Optimistic UI Update
      setLinks(newLinks);
      setCategories(newCategories);
      
      // 2. Save to Local Cache
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: newLinks, categories: newCategories }));

      // 3. Sync to Cloud (if authenticated)
      if (authToken) {
          syncToCloud(newLinks, newCategories, authToken);
      }
  };

  // --- Context Menu Functions ---
  const handleContextMenu = (event: React.MouseEvent, link: LinkItem) => {
    event.preventDefault();
    event.stopPropagation();
    
    // 在批量编辑模式下禁用右键菜单
    if (isBatchEditMode) return;
    
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      link: link
    });
  };

  const closeContextMenu = () => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      link: null
    });
  };

  const copyLinkToClipboard = () => {
    if (!contextMenu.link) return;
    
    navigator.clipboard.writeText(contextMenu.link.url)
      .then(() => {
        // 可以添加一个短暂的提示
        console.log('链接已复制到剪贴�?);
      })
      .catch(err => {
        console.error('复制链接失败:', err);
      });
    
    closeContextMenu();
  };

  const showQRCode = () => {
    if (!contextMenu.link) return;
    
    setQrCodeModal({
      isOpen: true,
      url: contextMenu.link.url,
      title: contextMenu.link.title
    });
    
    closeContextMenu();
  };

  const editLinkFromContextMenu = () => {
    if (!contextMenu.link) return;
    
    setEditingLink(contextMenu.link);
    setIsModalOpen(true);
    closeContextMenu();
  };

  const deleteLinkFromContextMenu = () => {
    if (!contextMenu.link) return;
    
    if (window.confirm(`确定要删�?${contextMenu.link.title}"吗？`)) {
      const newLinks = links.filter(link => link.id !== contextMenu.link!.id);
      updateData(newLinks, categories);
    }
    
    closeContextMenu();
  };

  const togglePinFromContextMenu = () => {
    if (!contextMenu.link) return;
    
    const linkToToggle = links.find(l => l.id === contextMenu.link!.id);
    if (!linkToToggle) return;
    
    // 如果是设置为置顶，则设置pinnedOrder为当前置顶链接数�?
    // 如果是取消置顶，则清除pinnedOrder
    const updated = links.map(l => {
      if (l.id === contextMenu.link!.id) {
        const isPinned = !l.pinned;
        return { 
          ...l, 
          pinned: isPinned,
          pinnedOrder: isPinned ? links.filter(link => link.pinned).length : undefined
        };
      }
      return l;
    });
    
    updateData(updated, categories);
    closeContextMenu();
  };

  // 加载链接图标缓存
  const loadLinkIcons = async (linksToLoad: LinkItem[]) => {
    if (!authToken) return; // 只有在已登录状态下才加载图标缓�?
    
    const updatedLinks = [...linksToLoad];
    const domainsToFetch: string[] = [];
    
    // 收集所有链接的域名（包括已有图标的链接�?
    for (const link of updatedLinks) {
      if (link.url) {
        try {
          let domain = link.url;
          if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
            domain = 'https://' + link.url;
          }
          
          if (domain.startsWith('http://') || domain.startsWith('https://')) {
            const urlObj = new URL(domain);
            domain = urlObj.hostname;
            domainsToFetch.push(domain);
          }
        } catch (e) {
          console.error("Failed to parse URL for icon loading", e);
        }
      }
    }
    
    // 批量获取图标
    if (domainsToFetch.length > 0) {
      const iconPromises = domainsToFetch.map(async (domain) => {
        try {
          const response = await fetch(`/api/storage?getConfig=favicon&domain=${encodeURIComponent(domain)}`);
          if (response.ok) {
            const data = await response.json();
            if (data.cached && data.icon) {
              return { domain, icon: data.icon };
            }
          }
        } catch (error) {
          console.log(`Failed to fetch cached icon for ${domain}`, error);
        }
        return null;
      });
      
      const iconResults = await Promise.all(iconPromises);
      
      // 更新链接的图�?
      iconResults.forEach(result => {
        if (result) {
          const linkToUpdate = updatedLinks.find(link => {
            if (!link.url) return false;
            try {
              let domain = link.url;
              if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
                domain = 'https://' + link.url;
              }
              
              if (domain.startsWith('http://') || domain.startsWith('https://')) {
                const urlObj = new URL(domain);
                return urlObj.hostname === result.domain;
              }
            } catch (e) {
              return false;
            }
            return false;
          });
          
          if (linkToUpdate) {
            // 只有当链接没有图标，或者当前图标是faviconextractor.com生成的，或者缓存中的图标是自定义图标时才更�?
            if (!linkToUpdate.icon || 
                linkToUpdate.icon.includes('faviconextractor.com') || 
                !result.icon.includes('faviconextractor.com')) {
              linkToUpdate.icon = result.icon;
            }
          }
        }
      });
      
      // 更新状�?
      setLinks(updatedLinks);
    }
  };

  // --- Effects ---

  useEffect(() => {
    // Theme init
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Load Token and check expiry
    const savedToken = localStorage.getItem(AUTH_KEY);
    const lastLoginTime = localStorage.getItem('lastLoginTime');
    
    if (savedToken) {
      const currentTime = Date.now();
      
      if (lastLoginTime) {
        const lastLogin = parseInt(lastLoginTime);
        const timeDiff = currentTime - lastLogin;
        
        const expiryDays = siteSettings.passwordExpiryDays || 7;
        const expiryTimeMs = expiryDays > 0 ? expiryDays * 24 * 60 * 60 * 1000 : 0;
        
        if (expiryTimeMs > 0 && timeDiff > expiryTimeMs) {
          localStorage.removeItem(AUTH_KEY);
          localStorage.removeItem('lastLoginTime');
          setAuthToken(null);
        } else {
          setAuthToken(savedToken);
        }
      } else {
        setAuthToken(savedToken);
      }
    }

    // Load WebDAV Config
    const savedWebDav = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (savedWebDav) {
        try {
            setWebDavConfig(JSON.parse(savedWebDav));
        } catch (e) {}
    }

    // Handle URL Params for Bookmarklet (Add Link)
    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
        const addTitle = urlParams.get('add_title') || '';
        // Clean URL params to avoid re-triggering on refresh
        window.history.replaceState({}, '', window.location.pathname);
        
        setPrefillLink({
            title: addTitle,
            url: addUrl,
            categoryId: 'common' // Default, Modal will handle selection
        });
        setEditingLink(undefined);
        setIsModalOpen(true);
    }

    // Initial Data Fetch
    const initData = async () => {
        // 首先检查是否需要认�?
        try {
            const authRes = await fetch('/api/storage?checkAuth=true');
            if (authRes.ok) {
                const authData = await authRes.json();
                setRequiresAuth(authData.requiresAuth);
                
                // 如果需要认证但用户未登录，则不获取数据
                if (authData.requiresAuth && !savedToken) {
                    setIsCheckingAuth(false);
                    setIsAuthOpen(true);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to check auth requirement.", e);
        }
        
        // 获取数据
        let hasCloudData = false;
        try {
            const res = await fetch('/api/storage', {
                headers: authToken ? { 'x-auth-password': authToken } : {}
            });
            if (res.ok) {
                const data = await res.json();
                if (data.links && data.links.length > 0) {
                    setLinks(data.links);
                    setCategories(data.categories || DEFAULT_CATEGORIES);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    
                    // 加载链接图标缓存
                    loadLinkIcons(data.links);
                    hasCloudData = true;
                }
            } else if (res.status === 401) {
                // 如果返回401，可能是密码过期，清除本地token并要求重新登�?
                const errorData = await res.json();
                if (errorData.error && errorData.error.includes('过期')) {
                    setAuthToken(null);
                    localStorage.removeItem(AUTH_KEY);
                    setIsAuthOpen(true);
                    setIsCheckingAuth(false);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to fetch from cloud, falling back to local.", e);
        }
        
        // 无论是否有云端数据，都尝试从KV空间加载搜索配置和网站配�?
        try {
            const searchConfigRes = await fetch('/api/storage?getConfig=search');
            if (searchConfigRes.ok) {
                const searchConfigData = await searchConfigRes.json();
                // 检查搜索配置是否有效（包含必要的字段）
                if (searchConfigData && (searchConfigData.mode || searchConfigData.externalSources || searchConfigData.selectedSource)) {
                    setSearchMode(searchConfigData.mode || 'external');
                    setExternalSearchSources(searchConfigData.externalSources || []);
                    // 加载已保存的选中搜索�?
                    if (searchConfigData.selectedSource) {
                        setSelectedSearchSource(searchConfigData.selectedSource);
                    }
                }
            }
            
            // 获取网站配置（包括密码过期时间设置）
            const websiteConfigRes = await fetch('/api/storage?getConfig=website');
            if (websiteConfigRes.ok) {
                const websiteConfigData = await websiteConfigRes.json();
                if (websiteConfigData) {
                    setSiteSettings(prev => ({
                        ...prev,
                        title: websiteConfigData.title || prev.title,
                        navTitle: websiteConfigData.navTitle || prev.navTitle,
                        favicon: websiteConfigData.favicon || prev.favicon,
                        cardStyle: websiteConfigData.cardStyle || prev.cardStyle,
                        passwordExpiryDays: websiteConfigData.passwordExpiryDays !== undefined ? websiteConfigData.passwordExpiryDays : prev.passwordExpiryDays
                    }));
                }
            }
        } catch (e) {
            console.warn("Failed to fetch configs from KV.", e);
        }
        
        // 如果有云端数据，则不需要加载本地数�?
        if (hasCloudData) {
            setIsCheckingAuth(false);
            return;
        }
        
        // 如果没有云端数据，则加载本地数据
        loadFromLocal();
        
        // 如果从KV空间加载搜索配置失败，直接使用默认配置（不使用localStorage回退�?
        setSearchMode('external');
        setExternalSearchSources([
            {
                id: 'bing',
                name: '必应',
                url: 'https://www.bing.com/search?q={query}',
                icon: 'Search',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'google',
                name: 'Google',
                url: 'https://www.google.com/search?q={query}',
                icon: 'Search',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'baidu',
                name: '百度',
                url: 'https://www.baidu.com/s?wd={query}',
                icon: 'Globe',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'sogou',
                name: '搜狗',
                url: 'https://www.sogou.com/web?query={query}',
                icon: 'Globe',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'yandex',
                name: 'Yandex',
                url: 'https://yandex.com/search/?text={query}',
                icon: 'Globe',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'github',
                name: 'GitHub',
                url: 'https://github.com/search?q={query}',
                icon: 'Github',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'linuxdo',
                name: 'Linux.do',
                url: 'https://linux.do/search?q={query}',
                icon: 'Terminal',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'bilibili',
                name: 'B�?,
                url: 'https://search.bilibili.com/all?keyword={query}',
                icon: 'Play',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'youtube',
                name: 'YouTube',
                url: 'https://www.youtube.com/results?search_query={query}',
                icon: 'Video',
                enabled: true,
                createdAt: Date.now()
            },
            {
                id: 'wikipedia',
                name: '维基',
                url: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}',
                icon: 'BookOpen',
                enabled: true,
                createdAt: Date.now()
            }
        ]);
        
        setIsLoadingSearchConfig(false);
        setIsCheckingAuth(false);
    };

    initData();
  }, []);

  // Update page title and favicon when site settings change
  useEffect(() => {
    if (siteSettings.title) {
      document.title = siteSettings.title;
    }
    
    if (siteSettings.favicon) {
      // Remove existing favicon links
      const existingFavicons = document.querySelectorAll('link[rel="icon"]');
      existingFavicons.forEach(favicon => favicon.remove());
      
      // Add new favicon
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = siteSettings.favicon;
      document.head.appendChild(favicon);
    }
  }, [siteSettings.title, siteSettings.favicon]);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // 视图模式切换处理函数
  const handleViewModeChange = (cardStyle: 'detailed' | 'simple') => {
    const newSiteSettings = { ...siteSettings, cardStyle };
    setSiteSettings(newSiteSettings);
    localStorage.setItem('cloudnav_site_settings', JSON.stringify(newSiteSettings));
  };

  // --- Batch Edit Functions ---
  const toggleBatchEditMode = () => {
    setIsBatchEditMode(!isBatchEditMode);
    setSelectedLinks(new Set()); // 退出批量编辑模式时清空选中�?
  };

  const toggleLinkSelection = (linkId: string) => {
    setSelectedLinks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(linkId)) {
        newSet.delete(linkId);
      } else {
        newSet.add(linkId);
      }
      return newSet;
    });
  };

  const handleBatchDelete = () => {
    if (!authToken) { setIsAuthOpen(true); return; }
    
    if (selectedLinks.size === 0) {
      alert('请先选择要删除的链接');
      return;
    }
    
    if (confirm(`确定要删除选中�?${selectedLinks.size} 个链接吗？`)) {
      const newLinks = links.filter(link => !selectedLinks.has(link.id));
      updateData(newLinks, categories);
      setSelectedLinks(new Set());
      setIsBatchEditMode(false);
    }
  };

  const handleBatchMove = (targetCategoryId: string) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    
    if (selectedLinks.size === 0) {
      alert('请先选择要移动的链接');
      return;
    }
    
    const newLinks = links.map(link => 
      selectedLinks.has(link.id) ? { ...link, categoryId: targetCategoryId } : link
    );
    updateData(newLinks, categories);
    setSelectedLinks(new Set());
    setIsBatchEditMode(false);
  };

  const handleSelectAll = () => {
    // 获取当前显示的所有链接ID
    const currentLinkIds = displayedLinks.map(link => link.id);
    
    // 如果已选中的链接数量等于当前显示的链接数量，则取消全�?
    if (selectedLinks.size === currentLinkIds.length && currentLinkIds.every(id => selectedLinks.has(id))) {
      setSelectedLinks(new Set());
    } else {
      // 否则全选当前显示的所有链�?
      setSelectedLinks(new Set(currentLinkIds));
    }
  };

  // --- Actions ---

  const handleLogin = async (password: string): Promise<boolean> => {
      try {
        // 首先验证密码
        const authResponse = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': password
            },
            body: JSON.stringify({ authOnly: true }) // 只用于验证密码，不更新数�?
        });
        
        if (authResponse.ok) {
            setAuthToken(password);
            localStorage.setItem(AUTH_KEY, password);
            setIsAuthOpen(false);
            setSyncStatus('saved');
            
            // 登录成功后，获取网站配置（包括密码过期时间设置）
            try {
                const websiteConfigRes = await fetch('/api/storage?getConfig=website');
                if (websiteConfigRes.ok) {
                    const websiteConfigData = await websiteConfigRes.json();
                    if (websiteConfigData) {
                        setSiteSettings(prev => ({
                            ...prev,
                            title: websiteConfigData.title || prev.title,
                            navTitle: websiteConfigData.navTitle || prev.navTitle,
                            favicon: websiteConfigData.favicon || prev.favicon,
                            cardStyle: websiteConfigData.cardStyle || prev.cardStyle,
                            passwordExpiryDays: websiteConfigData.passwordExpiryDays !== undefined ? websiteConfigData.passwordExpiryDays : prev.passwordExpiryDays
                        }));
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch website config after login.", e);
            }
            
            // 检查密码是否过�?
            const lastLoginTime = localStorage.getItem('lastLoginTime');
            const currentTime = Date.now();
            
            if (lastLoginTime) {
                const lastLogin = parseInt(lastLoginTime);
                const timeDiff = currentTime - lastLogin;
                
                const expiryTimeMs = (siteSettings.passwordExpiryDays || 7) > 0 ? (siteSettings.passwordExpiryDays || 7) * 24 * 60 * 60 * 1000 : 0;
                
                if (expiryTimeMs > 0 && timeDiff > expiryTimeMs) {
                    setAuthToken(null);
                    localStorage.removeItem(AUTH_KEY);
                    setIsAuthOpen(true);
                    alert('您的密码已过期，请重新登�?);
                    return false;
                }
            }
            
            localStorage.setItem('lastLoginTime', currentTime.toString());
            
            // 登录成功后，从服务器获取数据
            try {
                const res = await fetch('/api/storage');
                if (res.ok) {
                    const data = await res.json();
                    // 如果服务器有数据，使用服务器数据
                    if (data.links && data.links.length > 0) {
                        setLinks(data.links);
                        setCategories(data.categories || DEFAULT_CATEGORIES);
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                        
                        // 加载链接图标缓存
                        loadLinkIcons(data.links);
                    } else {
                        // 如果服务器没有数据，使用本地数据
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links, categories }));
                        // 并将本地数据同步到服务器
                        syncToCloud(links, categories, password);
                        
                        // 加载链接图标缓存
                        loadLinkIcons(links);
                    }
                } 
            } catch (e) {
                console.warn("Failed to fetch data after login.", e);
                loadFromLocal();
                // 尝试将本地数据同步到服务�?
                syncToCloud(links, categories, password);
            }
            
            // 登录成功后，从KV空间加载AI配置
            try {
                const aiConfigRes = await fetch('/api/storage?getConfig=ai');
                if (aiConfigRes.ok) {
                    const aiConfigData = await aiConfigRes.json();
                    if (aiConfigData && Object.keys(aiConfigData).length > 0) {
                        setAiConfig(aiConfigData);
                        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(aiConfigData));
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch AI config after login.", e);
            }
            
            return true;
        }
        return false;
      } catch (e) {
          return false;
      }
  };

  const handleLogout = () => {
      setAuthToken(null);
      localStorage.removeItem(AUTH_KEY);
      setSyncStatus('offline');
      // 退出后重新加载本地数据
      loadFromLocal();
  };

  // 分类操作密码验证处理函数
  const handleCategoryActionAuth = async (password: string): Promise<boolean> => {
    try {
      // 验证密码
      const authResponse = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-password': password
        },
        body: JSON.stringify({ authOnly: true })
      });
      
      return authResponse.ok;
    } catch (error) {
      console.error('Category action auth error:', error);
      return false;
    }
  };

  // 打开分类操作验证弹窗
  const openCategoryActionAuth = (action: 'edit' | 'delete', categoryId: string, categoryName: string) => {
    setCategoryActionAuth({
      isOpen: true,
      action,
      categoryId,
      categoryName
    });
  };

  // 关闭分类操作验证弹窗
  const closeCategoryActionAuth = () => {
    setCategoryActionAuth({
      isOpen: false,
      action: 'edit',
      categoryId: '',
      categoryName: ''
    });
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
      // Merge categories: Avoid duplicate names/IDs
      const mergedCategories = [...categories];
      
      // 确保"常用推荐"分类始终存在
      if (!mergedCategories.some(c => c.id === 'common')) {
        mergedCategories.push({ id: 'common', name: '常用推荐', icon: 'Star' });
      }
      
      newCategories.forEach(nc => {
          if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
              mergedCategories.push(nc);
          }
      });

      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
      setIsImportModalOpen(false);
      alert(`成功导入 ${newLinks.length} 个新书签!`);
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    
    // 处理URL，确保有协议前缀
    let processedUrl = data.url;
    if (processedUrl && !processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
    }
    
    // 获取当前分类下的所有链接（不包括置顶链接）
    const categoryLinks = links.filter(link => 
      !link.pinned && (data.categoryId === 'all' || link.categoryId === data.categoryId)
    );
    
    // 计算新链接的order值，使其排在分类最�?
    const maxOrder = categoryLinks.length > 0 
      ? Math.max(...categoryLinks.map(link => link.order || 0))
      : -1;
    
    const newLink: LinkItem = {
      ...data,
      url: processedUrl, // 使用处理后的URL
      id: Date.now().toString(),
      createdAt: Date.now(),
      order: maxOrder + 1, // 设置为当前分类的最大order�?1，确保排在最�?
      // 如果是置顶链接，设置pinnedOrder为当前置顶链接数�?
      pinnedOrder: data.pinned ? links.filter(l => l.pinned).length : undefined
    };
    
    // 将新链接插入到合适的位置，而不是直接放在开�?
    // 如果是置顶链接，放在置顶链接区域的最�?
    if (newLink.pinned) {
      const firstNonPinnedIndex = links.findIndex(link => !link.pinned);
      if (firstNonPinnedIndex === -1) {
        // 如果没有非置顶链接，直接添加到末�?
        updateData([...links, newLink], categories);
      } else {
        // 插入到非置顶链接之前
        const updatedLinks = [...links];
        updatedLinks.splice(firstNonPinnedIndex, 0, newLink);
        updateData(updatedLinks, categories);
      }
    } else {
      // 非置顶链接，按照order字段排序后插�?
      const updatedLinks = [...links, newLink].sort((a, b) => {
        // 置顶链接始终排在前面
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        
        // 同类型链接按照order排序
        const aOrder = a.order !== undefined ? a.order : a.createdAt;
        const bOrder = b.order !== undefined ? b.order : b.createdAt;
        return aOrder - bOrder;
      });
      updateData(updatedLinks, categories);
    }
    
    // Clear prefill if any
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (!editingLink) return;
    
    // 处理URL，确保有协议前缀
    let processedUrl = data.url;
    if (processedUrl && !processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
      processedUrl = 'https://' + processedUrl;
    }
    
    const updated = links.map(l => l.id === editingLink.id ? { ...l, ...data, url: processedUrl } : l);
    updateData(updated, categories);
    setEditingLink(undefined);
  };

  // 拖拽结束事件处理函数
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // 获取当前分类下的所有链�?
      const categoryLinks = links.filter(link => 
        selectedCategory === 'all' || link.categoryId === selectedCategory
      );
      
      // 找到被拖拽元素和目标元素的索�?
      const activeIndex = categoryLinks.findIndex(link => link.id === active.id);
      const overIndex = categoryLinks.findIndex(link => link.id === over.id);
      
      if (activeIndex !== -1 && overIndex !== -1) {
        // 重新排序当前分类的链�?
        const reorderedCategoryLinks = arrayMove(categoryLinks, activeIndex, overIndex);
        
        // 更新所有链接的顺序
        const updatedLinks = links.map(link => {
          const reorderedIndex = reorderedCategoryLinks.findIndex(l => l.id === link.id);
          if (reorderedIndex !== -1) {
            return { ...link, order: reorderedIndex };
          }
          return link;
        });
        
        // 按照order字段重新排序
        updatedLinks.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        updateData(updatedLinks, categories);
      }
    }
  };

  // 置顶链接拖拽结束事件处理函数
  const handlePinnedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // 获取所有置顶链�?
      const pinnedLinksList = links.filter(link => link.pinned);
      
      // 找到被拖拽元素和目标元素的索�?
      const activeIndex = pinnedLinksList.findIndex(link => link.id === active.id);
      const overIndex = pinnedLinksList.findIndex(link => link.id === over.id);
      
      if (activeIndex !== -1 && overIndex !== -1) {
        // 重新排序置顶链接
        const reorderedPinnedLinks = arrayMove(pinnedLinksList, activeIndex, overIndex);
        
        // 创建一个映射，存储每个置顶链接的新pinnedOrder
        const pinnedOrderMap = new Map<string, number>();
        reorderedPinnedLinks.forEach((link, index) => {
          pinnedOrderMap.set(link.id, index);
        });
        
        // 只更新置顶链接的pinnedOrder，不改变任何链接的顺�?
        const updatedLinks = links.map(link => {
          if (link.pinned) {
            return { 
              ...link, 
              pinnedOrder: pinnedOrderMap.get(link.id) 
            };
          }
          return link;
        });
        
        // 按照pinnedOrder重新排序整个链接数组，确保置顶链接的顺序正确
        // 同时保持非置顶链接的相对顺序不变
        updatedLinks.sort((a, b) => {
          // 如果都是置顶链接，按照pinnedOrder排序
          if (a.pinned && b.pinned) {
            return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
          }
          // 如果只有一个是置顶链接，置顶链接排在前�?
          if (a.pinned) return -1;
          if (b.pinned) return 1;
          // 如果都不是置顶链接，保持原位置不变（按照order或createdAt排序�?
          const aOrder = a.order !== undefined ? a.order : a.createdAt;
          const bOrder = b.order !== undefined ? b.order : b.createdAt;
          return bOrder - aOrder;
        });
        
        updateData(updatedLinks, categories);
      }
    }
  };

  // 开始排�?
  const startSorting = (categoryId: string) => {
    setIsSortingMode(categoryId);
  };

  // 保存排序
  const saveSorting = () => {
    // 在保存排序时，确保将当前排序后的数据保存到服务器和本地存�?
    updateData(links, categories);
    setIsSortingMode(null);
  };

  // 取消排序
  const cancelSorting = () => {
    setIsSortingMode(null);
  };

  // 保存置顶链接排序
  const savePinnedSorting = () => {
    // 在保存排序时，确保将当前排序后的数据保存到服务器和本地存�?
    updateData(links, categories);
    setIsSortingPinned(false);
  };

  // 取消置顶链接排序
  const cancelPinnedSorting = () => {
    setIsSortingPinned(false);
  };

  // 设置dnd-kit的传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖�?px才开始拖拽，避免误触
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDeleteLink = (id: string) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (confirm('确定删除此链接吗?')) {
      updateData(links.filter(l => l.id !== id), categories);
    }
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!authToken) { setIsAuthOpen(true); return; }
      
      const linkToToggle = links.find(l => l.id === id);
      if (!linkToToggle) return;
      
      // 如果是设置为置顶，则设置pinnedOrder为当前置顶链接数�?
      // 如果是取消置顶，则清除pinnedOrder
      const updated = links.map(l => {
        if (l.id === id) {
          const isPinned = !l.pinned;
          return { 
            ...l, 
            pinned: isPinned,
            pinnedOrder: isPinned ? links.filter(link => link.pinned).length : undefined
          };
        }
        return l;
      });
      
      updateData(updated, categories);
  };

  const handleSaveAIConfig = async (config: AIConfig, newSiteSettings?: any) => {
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      
      if (newSiteSettings) {
          setSiteSettings(newSiteSettings);
          localStorage.setItem('cloudnav_site_settings', JSON.stringify(newSiteSettings));
      }
      
      if (authToken) {
          try {
              const response = await fetch('/api/storage', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'x-auth-password': authToken
                  },
                  body: JSON.stringify({
                      saveConfig: 'ai',
                      config: config
                  })
              });
              
              if (!response.ok) {
                  console.error('Failed to save AI config to KV:', response.statusText);
              }
          } catch (error) {
              console.error('Error saving AI config to KV:', error);
          }
          
          if (newSiteSettings) {
              try {
                  const response = await fetch('/api/storage', {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-auth-password': authToken
                      },
                      body: JSON.stringify({
                          saveConfig: 'website',
                          config: newSiteSettings
                      })
                  });
                  
                  if (!response.ok) {
                      console.error('Failed to save website config to KV:', response.statusText);
                  }
              } catch (error) {
                  console.error('Error saving website config to KV:', error);
              }
          }
      }
  };

  const handleRestoreAIConfig = async (config: AIConfig) => {
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      
      // 同时保存到KV空间
      if (authToken) {
          try {
              const response = await fetch('/api/storage', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'x-auth-password': authToken
                  },
                  body: JSON.stringify({
                      saveConfig: 'ai',
                      config: config
                  })
              });
              
              if (!response.ok) {
                  console.error('Failed to restore AI config to KV:', response.statusText);
              }
          } catch (error) {
              console.error('Error restoring AI config to KV:', error);
          }
      }
  };

  // --- Category Management & Security ---

  const handleCategoryClick = (cat: Category) => {
      // If category has password and is NOT unlocked
      if (cat.password && !unlockedCategoryIds.has(cat.id)) {
          setCatAuthModalData(cat);
          setSidebarOpen(false);
          return;
      }
      setSelectedCategory(cat.id);
      setSidebarOpen(false);
  };

  const handleUnlockCategory = (catId: string) => {
      setUnlockedCategoryIds(prev => new Set(prev).add(catId));
      setSelectedCategory(catId);
  };

  const handleUpdateCategories = (newCats: Category[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      
      // 防止删除"常用推荐"分类
      if (catId === 'common') {
          alert('"常用推荐"分类不能被删�?);
          return;
      }
      
      let newCats = categories.filter(c => c.id !== catId);
      
      // 检查是否存�?常用推荐"分类，如果不存在则创建它
      if (!newCats.some(c => c.id === 'common')) {
          newCats = [
              { id: 'common', name: '常用推荐', icon: 'Star' },
              ...newCats
          ];
      }
      
      // Move links to common or first available
      const targetId = 'common'; 
      const newLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: targetId } : l);
      
      updateData(newLinks, newCats);
  };

  // --- WebDAV Config ---
  const handleSaveWebDavConfig = (config: WebDavConfig) => {
      setWebDavConfig(config);
      localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config));
  };

  // 搜索源选择弹出窗口状�?
  const [showSearchSourcePopup, setShowSearchSourcePopup] = useState(false);
  const [hoveredSearchSource, setHoveredSearchSource] = useState<ExternalSearchSource | null>(null);
  const [selectedSearchSource, setSelectedSearchSource] = useState<ExternalSearchSource | null>(null);
  const [isIconHovered, setIsIconHovered] = useState(false);
  const [isPopupHovered, setIsPopupHovered] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 处理弹出窗口显示/隐藏逻辑
  useEffect(() => {
    if (isIconHovered || isPopupHovered) {
      // 如果图标或弹出窗口被悬停，清除隐藏定时器并显示弹出窗�?
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setShowSearchSourcePopup(true);
    } else {
      // 如果图标和弹出窗口都没有被悬停，设置一个延迟隐藏弹出窗�?
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        setShowSearchSourcePopup(false);
        setHoveredSearchSource(null);
      }, 100);
    }
    
    // 清理函数
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isIconHovered, isPopupHovered]);

  // 处理搜索源选择
  const handleSearchSourceSelect = async (source: ExternalSearchSource) => {
    // 更新选中的搜索源
    setSelectedSearchSource(source);
    
    // 保存选中的搜索源到KV空间
    await handleSaveSearchConfig(externalSearchSources, searchMode, source);
    
    if (searchQuery.trim()) {
      const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
      window.open(searchUrl, '_blank');
    }
    setShowSearchSourcePopup(false);
    setHoveredSearchSource(null);
  };

  // --- Search Config ---
  const handleSaveSearchConfig = async (sources: ExternalSearchSource[], mode: SearchMode, selectedSource?: ExternalSearchSource | null) => {
      const searchConfig: SearchConfig = {
          mode,
          externalSources: sources,
          selectedSource: selectedSource !== undefined ? selectedSource : selectedSearchSource
      };
      
      setExternalSearchSources(sources);
      setSearchMode(mode);
      if (selectedSource !== undefined) {
          setSelectedSearchSource(selectedSource);
      }
      
      // 只保存到KV空间（搜索配置允许无密码访问�?
      try {
          const headers: Record<string, string> = {
              'Content-Type': 'application/json'
          };
          
          // 如果有认证令牌，添加认证�?
          if (authToken) {
              headers['x-auth-password'] = authToken;
          }
          
          const response = await fetch('/api/storage', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                  saveConfig: 'search',
                  config: searchConfig
              })
          });
          
          if (!response.ok) {
              console.error('Failed to save search config to KV:', response.statusText);
          }
      } catch (error) {
          console.error('Error saving search config to KV:', error);
      }
  };

  const handleSearchModeChange = (mode: SearchMode) => {
      setSearchMode(mode);
      
      // 如果切换到外部搜索模式且搜索源列表为空，自动加载默认搜索�?
      if (mode === 'external' && externalSearchSources.length === 0) {
          const defaultSources: ExternalSearchSource[] = [
              {
                  id: 'bing',
                  name: '必应',
                  url: 'https://www.bing.com/search?q={query}',
                  icon: 'Search',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'google',
                  name: 'Google',
                  url: 'https://www.google.com/search?q={query}',
                  icon: 'Search',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'baidu',
                  name: '百度',
                  url: 'https://www.baidu.com/s?wd={query}',
                  icon: 'Globe',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'sogou',
                  name: '搜狗',
                  url: 'https://www.sogou.com/web?query={query}',
                  icon: 'Globe',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'yandex',
                  name: 'Yandex',
                  url: 'https://yandex.com/search/?text={query}',
                  icon: 'Globe',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'github',
                  name: 'GitHub',
                  url: 'https://github.com/search?q={query}',
                  icon: 'Github',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'linuxdo',
                  name: 'Linux.do',
                  url: 'https://linux.do/search?q={query}',
                  icon: 'Terminal',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'bilibili',
                  name: 'B�?,
                  url: 'https://search.bilibili.com/all?keyword={query}',
                  icon: 'Play',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'youtube',
                  name: 'YouTube',
                  url: 'https://www.youtube.com/results?search_query={query}',
                  icon: 'Video',
                  enabled: true,
                  createdAt: Date.now()
              },
              {
                  id: 'wikipedia',
                  name: '维基',
                  url: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}',
                  icon: 'BookOpen',
                  enabled: true,
                  createdAt: Date.now()
              }
          ];
          
          // 保存默认搜索源到状态和KV空间
          handleSaveSearchConfig(defaultSources, mode);
      } else {
          handleSaveSearchConfig(externalSearchSources, mode);
      }
  };

  const handleExternalSearch = () => {
      if (searchQuery.trim() && searchMode === 'external') {
          // 如果搜索源列表为空，自动加载默认搜索�?
          if (externalSearchSources.length === 0) {
              const defaultSources: ExternalSearchSource[] = [
                  {
                      id: 'bing',
                      name: '必应',
                      url: 'https://www.bing.com/search?q={query}',
                      icon: 'Search',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'google',
                      name: 'Google',
                      url: 'https://www.google.com/search?q={query}',
                      icon: 'Search',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'baidu',
                      name: '百度',
                      url: 'https://www.baidu.com/s?wd={query}',
                      icon: 'Globe',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'sogou',
                      name: '搜狗',
                      url: 'https://www.sogou.com/web?query={query}',
                      icon: 'Globe',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'yandex',
                      name: 'Yandex',
                      url: 'https://yandex.com/search/?text={query}',
                      icon: 'Globe',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'github',
                      name: 'GitHub',
                      url: 'https://github.com/search?q={query}',
                      icon: 'Github',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'linuxdo',
                      name: 'Linux.do',
                      url: 'https://linux.do/search?q={query}',
                      icon: 'Terminal',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'bilibili',
                      name: 'B�?,
                      url: 'https://search.bilibili.com/all?keyword={query}',
                      icon: 'Play',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'youtube',
                      name: 'YouTube',
                      url: 'https://www.youtube.com/results?search_query={query}',
                      icon: 'Video',
                      enabled: true,
                      createdAt: Date.now()
                  },
                  {
                      id: 'wikipedia',
                      name: '维基',
                      url: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}',
                      icon: 'BookOpen',
                      enabled: true,
                      createdAt: Date.now()
                  }
              ];
              
              // 保存默认搜索源到状态和KV空间
              handleSaveSearchConfig(defaultSources, 'external');
              
              // 使用第一个默认搜索源立即执行搜索
              const searchUrl = defaultSources[0].url.replace('{query}', encodeURIComponent(searchQuery));
              window.open(searchUrl, '_blank');
              return;
          }
          
          // 如果有选中的搜索源，使用选中的搜索源；否则使用第一个启用的搜索�?
          let source = selectedSearchSource;
          if (!source) {
              const enabledSources = externalSearchSources.filter(s => s.enabled);
              if (enabledSources.length > 0) {
                  source = enabledSources[0];
              }
          }
          
          if (source) {
              const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
              window.open(searchUrl, '_blank');
          }
      }
  };

  const handleRestoreBackup = (restoredLinks: LinkItem[], restoredCategories: Category[]) => {
      updateData(restoredLinks, restoredCategories);
      setIsBackupModalOpen(false);
  };

  const handleRestoreSearchConfig = (restoredSearchConfig: SearchConfig) => {
      handleSaveSearchConfig(restoredSearchConfig.externalSources, restoredSearchConfig.mode);
  };

  // --- Filtering & Memo ---

  // Helper to check if a category is "Locked" (Has password AND not unlocked)
  const isCategoryLocked = (catId: string) => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.password) return false;
      return !unlockedCategoryIds.has(catId);
  };

  const pinnedLinks = useMemo(() => {
      // Don't show pinned links if they belong to a locked category
      const filteredPinnedLinks = links.filter(l => l.pinned && !isCategoryLocked(l.categoryId));
      // 按照pinnedOrder字段排序，如果没有pinnedOrder字段则按创建时间排序
      return filteredPinnedLinks.sort((a, b) => {
        // 如果有pinnedOrder字段，则使用pinnedOrder排序
        if (a.pinnedOrder !== undefined && b.pinnedOrder !== undefined) {
          return a.pinnedOrder - b.pinnedOrder;
        }
        // 如果只有一个有pinnedOrder字段，有pinnedOrder的排在前�?
        if (a.pinnedOrder !== undefined) return -1;
        if (b.pinnedOrder !== undefined) return 1;
        // 如果都没有pinnedOrder字段，则按创建时间排�?
        return a.createdAt - b.createdAt;
      });
  }, [links, categories, unlockedCategoryIds]);

  const displayedLinks = useMemo(() => {
    let result = links;
    
    // Security Filter: Always hide links from locked categories
    result = result.filter(l => !isCategoryLocked(l.categoryId));

    // Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
    }

    // Category Filter
    if (selectedCategory !== 'all') {
      result = result.filter(l => l.categoryId === selectedCategory);
    }
    
    // 按照order字段排序，如果没有order字段则按创建时间排序
    // 修改排序逻辑：order值越大排在越前面，新增的卡片order值最大，会排在最前面
    // 我们需要反转这个排序，让新增的卡片(order值最�?排在最后面
    return result.sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : a.createdAt;
      const bOrder = b.order !== undefined ? b.order : b.createdAt;
      // 改为升序排序，这样order值小(旧卡�?的排在前面，order值大(新卡�?的排在后�?
      return aOrder - bOrder;
    });
  }, [links, selectedCategory, searchQuery, categories, unlockedCategoryIds]);

  // 计算其他目录的搜索结�?
  const otherCategoryResults = useMemo(() => {
    if (!searchQuery.trim() || selectedCategory === 'all') {
      return [];
    }

    const q = searchQuery.toLowerCase();
    
    // 获取其他目录中匹配的链接
    const otherLinks = links.filter(link => {
      // 排除当前目录的链�?
      if (link.categoryId === selectedCategory) {
        return false;
      }
      
      // 排除锁定的目�?
      if (isCategoryLocked(link.categoryId)) {
        return false;
      }
      
      // 搜索匹配
      return (
        link.title.toLowerCase().includes(q) || 
        link.url.toLowerCase().includes(q) ||
        (link.description && link.description.toLowerCase().includes(q))
      );
    });

    // 按目录分�?
    const groupedByCategory = otherLinks.reduce((acc, link) => {
      if (!acc[link.categoryId]) {
        acc[link.categoryId] = [];
      }
      acc[link.categoryId].push(link);
      return acc;
    }, {} as Record<string, LinkItem[]>);

    // 对每个目录内的链接进行排�?
    Object.keys(groupedByCategory).forEach(categoryId => {
      groupedByCategory[categoryId].sort((a, b) => {
        const aOrder = a.order !== undefined ? a.order : a.createdAt;
        const bOrder = b.order !== undefined ? b.order : b.createdAt;
        return aOrder - bOrder;
      });
    });

    return groupedByCategory;
  }, [links, selectedCategory, searchQuery, categories, unlockedCategoryIds]);


  // --- Render Components ---

  // 创建可排序的链接卡片组件
  const SortableLinkCard = ({ link }: { link: LinkItem }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: link.id });
    
    // 根据视图模式决定卡片样式
    const isDetailedView = siteSettings.cardStyle === 'detailed';
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 1000 : 'auto',
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative transition-all duration-200 cursor-grab active:cursor-grabbing min-w-0 max-w-full overflow-hidden hover:shadow-lg hover:shadow-green-100/50 dark:hover:shadow-green-900/20 ${
          isSortingMode || isSortingPinned
            ? 'bg-green-20 dark:bg-green-900/30 border-green-200 dark:border-green-800' 
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
        } ${isDragging ? 'shadow-2xl scale-105' : ''} ${
          isDetailedView 
            ? 'flex flex-col rounded-2xl border shadow-sm p-4 min-h-[100px] hover:border-green-400 dark:hover:border-green-500' 
            : 'flex items-center rounded-xl border shadow-sm hover:border-green-300 dark:hover:border-green-600'
        }`}
        {...attributes}
        {...listeners}
      >
        {/* 链接内容 - 移除a标签，改为div防止点击跳转 */}
        <div className={`flex flex-1 min-w-0 overflow-hidden ${
          isDetailedView ? 'flex-col' : 'items-center gap-3'
        }`}>
          {/* 第一行：图标和标题水平排�?*/}
          <div className={`flex items-center gap-3 mb-2 ${
            isDetailedView ? '' : 'w-full'
          }`}>
            {/* Icon */}
            <div className={`text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold uppercase shrink-0 ${
              isDetailedView ? 'w-8 h-8 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800' : 'w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700'
            }`}>
                {link.icon ? <img src={link.icon} alt="" className="w-5 h-5"/> : link.title.charAt(0)}
            </div>
            
            {/* 标题 */}
            <h3 className={`text-slate-900 dark:text-slate-100 truncate overflow-hidden text-ellipsis ${
              isDetailedView ? 'text-base' : 'text-sm font-medium text-slate-800 dark:text-slate-200'
            }`} title={link.title}>
                {link.title}
            </h3>
          </div>
          
          {/* 第二行：描述文字 */}
             {isDetailedView && link.description && (
               <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                 {link.description}
               </p>
             )}
        </div>
      </div>
    );
  };

  const renderLinkCard = (link: LinkItem) => {
    const isSelected = selectedLinks.has(link.id);
    
    // 根据视图模式决定卡片样式
    const isDetailedView = siteSettings.cardStyle === 'detailed';
    
    return (
      <div
        key={link.id}
        className={`group relative transition-all duration-200 hover:shadow-lg hover:shadow-blue-100/50 dark:hover:shadow-blue-900/20 ${
          isSelected 
            ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' 
            : 'bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-slate-200 dark:border-slate-700'
        } ${isBatchEditMode ? 'cursor-pointer' : ''} ${
          isDetailedView 
            ? 'flex flex-col rounded-2xl border shadow-sm p-4 min-h-[100px] hover:border-blue-400 dark:hover:border-blue-500' 
            : 'flex items-center justify-between rounded-xl border shadow-sm p-3 hover:border-blue-300 dark:hover:border-blue-600'
        }`}
        onClick={() => isBatchEditMode && toggleLinkSelection(link.id)}
        onContextMenu={(e) => handleContextMenu(e, link)}
      >
        {/* 链接内容 - 在批量编辑模式下不使用a标签 */}
        {isBatchEditMode ? (
          <div className={`flex flex-1 min-w-0 overflow-hidden h-full ${
            isDetailedView ? 'flex-col' : 'items-center'
          }`}>
            {/* 第一行：图标和标题水平排�?*/}
            <div className={`flex items-center gap-3 w-full`}>
              {/* Icon */}
              <div className={`text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold uppercase shrink-0 ${
                isDetailedView ? 'w-8 h-8 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800' : 'w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700'
              }`}>
                  {link.icon ? <img src={link.icon} alt="" className="w-5 h-5"/> : link.title.charAt(0)}
              </div>
              
              {/* 标题 */}
              <h3 className={`text-slate-900 dark:text-slate-100 truncate overflow-hidden text-ellipsis ${
                isDetailedView ? 'text-base' : 'text-sm font-medium text-slate-800 dark:text-slate-200'
              }`} title={link.title}>
                  {link.title}
              </h3>
            </div>
            
            {/* 第二行：描述文字 */}
            {isDetailedView && link.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                {link.description}
              </p>
            )}
          </div>
        ) : (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-1 min-w-0 overflow-hidden h-full ${
              isDetailedView ? 'flex-col' : 'items-center'
            }`}
            title={isDetailedView ? link.url : (link.description || link.url)} // 详情版视图只显示URL作为tooltip
          >
            {/* 第一行：图标和标题水平排�?*/}
            <div className={`flex items-center gap-3 w-full`}>
              {/* Icon */}
              <div className={`text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold uppercase shrink-0 ${
                isDetailedView ? 'w-8 h-8 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800' : 'w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700'
              }`}>
                  {link.icon ? <img src={link.icon} alt="" className="w-5 h-5"/> : link.title.charAt(0)}
              </div>
              
              {/* 标题 */}
                <h3 className={`text-slate-800 dark:text-slate-200 truncate whitespace-nowrap overflow-hidden text-ellipsis group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${
                  isDetailedView ? 'text-base' : 'text-sm font-medium'
                }`} title={link.title}>
                    {link.title}
                </h3>
            </div>
            
            {/* 第二行：描述文字 */}
              {isDetailedView && link.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {link.description}
                </p>
              )}
            {!isDetailedView && link.description && (
              <div className="tooltip-custom absolute left-0 -top-8 w-max max-w-[200px] bg-black text-white text-xs p-2 rounded opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all z-20 pointer-events-none truncate">
                {link.description}
              </div>
            )}
          </a>
        )}

        {/* Hover Actions (Absolute Right) - 在批量编辑模式下隐藏 */}
        {!isBatchEditMode && (
          <div className={`flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 dark:bg-blue-900/20 backdrop-blur-sm rounded-md p-1 absolute ${
            isDetailedView ? 'top-3 right-3' : 'top-1/2 -translate-y-1/2 right-2'
          }`}>
              <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingLink(link); setIsModalOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                  title="编辑"
              >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.65-.07-.97l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.64-.07.97c0 .33.03.65.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.39 1.06.73 1.69.98l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.22.08.49 0 .61-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.63Z" fill="currentColor"/>
                  </svg>
              </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 dark:text-slate-50">
      {/* 认证遮罩�?- 当需要认证时显示 */}
      {requiresAuth && !authToken && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex items-center justify-center">
          <div className="w-full max-w-md p-6">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                需要身份验�?
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                此导航页面设置了访问密码，请输入密码以继续访�?
              </p>
            </div>
            <AuthModal isOpen={true} onLogin={handleLogin} />
          </div>
        </div>
      )}
      
      {/* 主要内容 - 只有在不需要认证或已认证时显示 */}
      {(!requiresAuth || authToken) && (
        <>
          <AuthModal isOpen={isAuthOpen} onLogin={handleLogin} />
      
      <CategoryAuthModal 
        isOpen={!!catAuthModalData}
        category={catAuthModalData}
        onClose={() => setCatAuthModalData(null)}
        onUnlock={handleUnlockCategory}
      />

      <CategoryManagerModal 
        isOpen={isCatManagerOpen} 
        onClose={() => setIsCatManagerOpen(false)}
        categories={categories}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategory={handleDeleteCategory}
        onVerifyPassword={handleCategoryActionAuth}
        authToken={authToken}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        links={links}
        categories={categories}
        onRestore={handleRestoreBackup}
        webDavConfig={webDavConfig}
        onSaveWebDavConfig={handleSaveWebDavConfig}
        searchConfig={{ mode: searchMode, externalSources: externalSearchSources }}
        onRestoreSearchConfig={handleRestoreSearchConfig}
        aiConfig={aiConfig}
        onRestoreAIConfig={handleRestoreAIConfig}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLinks={links}
        categories={categories}
        onImport={handleImportConfirm}
        onImportSearchConfig={handleRestoreSearchConfig}
        onImportAIConfig={handleRestoreAIConfig}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={aiConfig}
        siteSettings={siteSettings}
        onSave={handleSaveAIConfig}
        links={links}
        categories={categories}
        onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
        authToken={authToken}
      />

      <SearchConfigModal
        isOpen={isSearchConfigModalOpen}
        onClose={() => setIsSearchConfigModalOpen(false)}
        sources={externalSearchSources}
        onSave={(sources) => handleSaveSearchConfig(sources, searchMode)}
      />

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
          bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              {siteSettings.navTitle || 'CloudNav'}
            </span>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            <button
              onClick={() => { setSelectedCategory('all'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                selectedCategory === 'all' 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="p-1"><Icon name="LayoutGrid" size={18} /></div>
              <span>置顶网站</span>
            </button>
            
            <div className="flex items-center justify-between pt-4 pb-2 px-4">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">分类目录</span>
               <button 
                  onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsCatManagerOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  title="管理分类"
               >
                  <Settings size={14} />
               </button>
            </div>

            NEW_CODE}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsImportModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="导入书签"
                >
                    <Upload size={14} />
                    <span>导入</span>
                </button>
                
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsBackupModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="备份与恢�?
                >
                    <CloudCog size={14} />
                    <span>备份</span>
                </button>

                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="AI 设置"
                >
                    <Settings size={14} />
                    <span>设置</span>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-xs px-2 mt-2">
               <div className="flex items-center gap-1 text-slate-400">
                 {syncStatus === 'saving' && <Loader2 className="animate-spin w-3 h-3 text-blue-500" />}
                 {syncStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                 {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                 {authToken ? <span className="text-green-600">已同�?/span> : <span className="text-amber-500">离线</span>}
               </div>

               <a 
                 href={GITHUB_REPO_URL} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                 title="Fork this project on GitHub"
               >
                 <GitFork size={14} />
                 <span>Fork 项目 v1.7.2 (支持二级目录)</span>
               </a>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden relative">
        
        {/* Header */}
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300">
              <Menu size={24} />
            </button>

            {/* 搜索模式切换 + 搜索�?*/}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* 移动端搜索图�?- 仅在手机端显示，平板端隐�?*/}
              <button 
                onClick={() => {
                  setIsMobileSearchOpen(!isMobileSearchOpen);
                  // 手机端点击搜索图标时默认使用站外搜索
                  if (searchMode !== 'external') {
                    handleSearchModeChange('external');
                  }
                }}
                className="sm:flex md:hidden lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                title="搜索"
              >
                <Search size={20} />
              </button>

              {/* 搜索模式切换 - 平板端和桌面端显示，手机端隐�?*/}
              <div className="hidden sm:hidden md:flex lg:flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-full p-1">
                  <button
                    onClick={() => handleSearchModeChange('internal')}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all flex items-center justify-center min-h-[24px] min-w-[40px] ${
                      searchMode === 'internal'
                        ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'
                    }`}
                    title="站内搜索"
                  >
                    站内
                  </button>
                  <button
                    onClick={() => handleSearchModeChange('external')}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all flex items-center justify-center min-h-[24px] min-w-[40px] ${
                      searchMode === 'external'
                        ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'
                    }`}
                    title="站外搜索"
                  >
                    站外
                  </button>
                </div>
                
                {/* 搜索配置管理按钮 */}
                {searchMode === 'external' && (
                  <button
                    onClick={() => setIsSearchConfigModalOpen(true)}
                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    title="管理搜索�?
                  >
                    <Settings size={14} />
                  </button>
                )}
              </div>

              {/* 搜索�?*/}
              <div className={`relative w-full max-w-lg ${isMobileSearchOpen ? 'block' : 'hidden'} sm:block`}>
                {/* 搜索源选择弹出窗口 */}
                {searchMode === 'external' && showSearchSourcePopup && (
                  <div 
                    className="absolute left-0 top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-3 z-50"
                    onMouseEnter={() => setIsPopupHovered(true)}
                    onMouseLeave={() => setIsPopupHovered(false)}
                  >
                    <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
                      {externalSearchSources
                        .filter(source => source.enabled)
                        .map((source, index) => (
                          <button
                            key={index}
                            onClick={() => handleSearchSourceSelect(source)}
                            onMouseEnter={() => setHoveredSearchSource(source)}
                            onMouseLeave={() => setHoveredSearchSource(null)}
                            className="px-2 py-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1 justify-center"
                          >
                            <img 
                              src={`https://www.faviconextractor.com/favicon/${new URL(source.url).hostname}?larger=true`}
                              alt={source.name}
                              className="w-4 h-4"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXNlYXJjaCI+PHBhdGggZD0ibTIxIDIxLTQuMzQtNC4zNCI+PC9wYXRoPjxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiPjwvY2lyY2xlPjwvc3ZnPg==';
                              }}
                            />
                            <span className="truncate hidden sm:inline">{source.name}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                
                {/* 搜索图标 */}
                <div 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                  onMouseEnter={() => searchMode === 'external' && setIsIconHovered(true)}
                  onMouseLeave={() => setIsIconHovered(false)}
                  onClick={() => {
                    // 移动端点击事件：显示搜索源选择窗口
                    if (searchMode === 'external') {
                      setShowSearchSourcePopup(!showSearchSourcePopup);
                    }
                  }}
                >
                  {searchMode === 'internal' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search">
                      <path d="m21 21-4.35-4.35"></path>
                      <circle cx="11" cy="11" r="8"></circle>
                    </svg>
                  ) : (hoveredSearchSource || selectedSearchSource) ? (
                    <img 
                      src={`https://www.faviconextractor.com/favicon/${new URL((hoveredSearchSource || selectedSearchSource).url).hostname}?larger=true`}
                      alt={(hoveredSearchSource || selectedSearchSource).name}
                      className="w-4 h-4"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXNlYXJjaCI+PHBhdGggZD0ibTIxIDIxLTQuMzQtNC4zNCI+PC9wYXRoPjxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiPjwvY2lyY2xlPjwvc3ZnPg==';
                      }}
                    />
                  ) : (
                    <Search size={16} />
                  )}
                </div>
                
                <input
                  type="text"
                  placeholder={
                    searchMode === 'internal' 
                      ? "搜索站内内容..." 
                      : selectedSearchSource 
                        ? `�?{selectedSearchSource.name}搜索内容` 
                        : "搜索站外内容..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchMode === 'external') {
                      handleExternalSearch();
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 rounded-full bg-slate-100 dark:bg-slate-700/50 border-none text-sm focus:ring-2 focus:ring-blue-500 dark:text-white placeholder-slate-400 outline-none transition-all"
                  // 移动端优化：防止页面缩放
                  style={{ fontSize: '16px' }}
                  inputMode="search"
                  enterKeyHint="search"
                />
                
                {searchMode === 'external' && searchQuery.trim() && (
                  <button
                    onClick={handleExternalSearch}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-500"
                    title="执行站外搜索"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
                
                {searchQuery.trim() && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 transition-all"
                    title="清空搜索"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 视图切换控制�?- 移动端：搜索框展开时隐藏，桌面端始终显�?*/}
            <div className={`${isMobileSearchOpen ? 'hidden' : 'flex'} lg:flex items-center bg-slate-100 dark:bg-slate-700 rounded-full p-1`}>
              <button
                onClick={() => handleViewModeChange('simple')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                  siteSettings.cardStyle === 'simple'
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'
                }`}
                title="简约版视图"
              >
                简�?
              </button>
              <button
                onClick={() => handleViewModeChange('detailed')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                  siteSettings.cardStyle === 'detailed'
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'
                }`}
                title="详情版视�?
              >
                详情
              </button>
            </div>

            {/* 主题切换按钮 - 移动端：搜索框展开时隐藏，桌面端始终显�?*/}
            <button onClick={toggleTheme} className={`${isMobileSearchOpen ? 'hidden' : 'flex'} lg:flex p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* 登录/退出按�?- 移动端：搜索框展开时隐藏，桌面端始终显�?*/}
            <div className={`${isMobileSearchOpen ? 'hidden' : 'flex'}`}>
              {!authToken ? (
                  <button onClick={() => setIsAuthOpen(true)} className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium">
                      <Cloud size={14} /> <span className="hidden sm:inline">登录</span>
                  </button>
              ) : (
                  <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium">
                      <LogOut size={14} /> <span className="hidden sm:inline">退�?/span>
                  </button>
              )}
            </div>

            {/* 添加按钮 - 移动端：搜索框展开时隐藏，桌面端始终显�?*/}
            <div className={`${isMobileSearchOpen ? 'hidden' : 'flex'}`}>
              <button
                onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(undefined); setIsModalOpen(true); }}}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-full text-sm font-medium shadow-lg shadow-blue-500/30"
              >
                <Plus size={16} /> <span className="hidden sm:inline">添加</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8">
            
            {/* 1. Pinned Area (Custom Top Area) */}
            {pinnedLinks.length > 0 && !searchQuery && (selectedCategory === 'all') && (
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Pin size={16} className="text-blue-500 fill-blue-500" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                置顶 / 常用
                            </h2>
                            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full">
                                {pinnedLinks.length}
                            </span>
                        </div>
                        {isSortingPinned ? (
                            <div className="flex gap-2">
                                <button 
                                    onClick={savePinnedSorting}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-full transition-colors"
                                    title="保存顺序"
                                >
                                    <Save size={14} />
                                    <span>保存顺序</span>
                                </button>
                                <button 
                                    onClick={cancelPinnedSorting}
                                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                                    title="取消排序"
                                >
                                    取消
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setIsSortingPinned(true)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors"
                                title="排序"
                            >
                                <GripVertical size={14} />
                                <span>排序</span>
                            </button>
                        )}
                    </div>
                    {isSortingPinned ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragEnd={handlePinnedDragEnd}
                        >
                            <SortableContext
                                items={pinnedLinks.map(link => link.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div className={`grid gap-3 ${
                                  siteSettings.cardStyle === 'detailed' 
                                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
                                    : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
                                }`}>
                                    {pinnedLinks.map(link => (
                                        <SortableLinkCard key={link.id} link={link} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    ) : (
                        <div className={`grid gap-3 ${
                          siteSettings.cardStyle === 'detailed' 
                            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
                            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
                        }`}>
                            {pinnedLinks.map(link => renderLinkCard(link))}
                        </div>
                    )}
                </section>
            )}

            {/* 2. Main Grid */}
            {(selectedCategory !== 'all' || searchQuery) && (
            <section>
                 {(!pinnedLinks.length && !searchQuery && selectedCategory === 'all') && (
                    <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg flex items-center justify-between">
                         <div>
                            <h1 className="text-xl font-bold">早安 👋</h1>
                            <p className="text-sm opacity-90 mt-1">
                                {links.length} 个链�?· {categories.length} 个分�?
                            </p>
                         </div>
                         <Icon name="Compass" size={48} className="opacity-20" />
                    </div>
                 )}

                 <div className="flex items-center justify-between mb-4">
                     <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                         {selectedCategory === 'all' 
                            ? (searchQuery ? '搜索结果' : '所有链�?) 
                            : (
                                <>
                                    {categories.find(c => c.id === selectedCategory)?.name}
                                    {isCategoryLocked(selectedCategory) && <Lock size={14} className="text-amber-500" />}
                                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full">
                                        {displayedLinks.length}
                                    </span>
                                </>
                            )
                         }
                     </h2>
                     {selectedCategory !== 'all' && !isCategoryLocked(selectedCategory) && (
                         isSortingMode === selectedCategory ? (
                             <div className="flex gap-2">
                                 <button 
                                     onClick={saveSorting}
                                     className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-full transition-colors"
                                     title="保存顺序"
                                 >
                                     <Save size={14} />
                                     <span>保存顺序</span>
                                 </button>
                                 <button 
                                     onClick={cancelSorting}
                                     className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                                     title="取消排序"
                                 >
                                     取消
                                 </button>
                             </div>
                         ) : (
                             <div className="flex gap-2">
                                 <button 
                                     onClick={toggleBatchEditMode}
                                     className={`flex items-center gap-1 px-3 py-1.5 text-white text-xs font-medium rounded-full transition-colors ${
                                         isBatchEditMode 
                                             ? 'bg-red-600 hover:bg-red-700' 
                                             : 'bg-blue-600 hover:bg-blue-700'
                                     }`}
                                     title={isBatchEditMode ? "退出批量编�? : "批量编辑"}
                                 >
                                     {isBatchEditMode ? '取消' : '批量编辑'}
                                 </button>
                                 {isBatchEditMode ? (
                                     <>
                                         <button 
                                             onClick={handleBatchDelete}
                                             className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-full transition-colors"
                                             title="批量删除"
                                         >
                                             <Trash2 size={14} />
                                             <span>批量删除</span>
                                         </button>
                                         <button 
                                             onClick={handleSelectAll}
                                             className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-full transition-colors"
                                             title="全�?取消全�?
                                         >
                                             <CheckSquare size={14} />
                                             <span>{selectedLinks.size === displayedLinks.length ? '取消全�? : '全�?}</span>
                                         </button>
                                         <div className="relative group">
                                              <button 
                                                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors"
                                                  title="批量移动"
                                              >
                                                  <Upload size={14} />
                                                  <span>批量移动</span>
                                              </button>
                                              <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                                                  {categories.filter(cat => cat.id !== selectedCategory).map(cat => (
                                                      <button
                                                          key={cat.id}
                                                          onClick={() => handleBatchMove(cat.id)}
                                                          className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg"
                                                      >
                                                          {cat.name}
                                                      </button>
                                                  ))}
                                              </div>
                                          </div>
                                     </>
                                 ) : (
                                     <button 
                                         onClick={() => startSorting(selectedCategory)}
                                         className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors"
                                         title="排序"
                                     >
                                         <GripVertical size={14} />
                                         <span>排序</span>
                                     </button>
                                 )}
                             </div>
                         )
                     )}
                 </div>

                 {displayedLinks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                        {isCategoryLocked(selectedCategory) ? (
                            <>
                                <Lock size={40} className="text-amber-400 mb-4" />
                                <p>该目录已锁定</p>
                                <button onClick={() => setCatAuthModalData(categories.find(c => c.id === selectedCategory) || null)} className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg">输入密码解锁</button>
                            </>
                        ) : (
                            <>
                                <Search size={40} className="opacity-30 mb-4" />
                                <p>没有找到相关内容</p>
                                {selectedCategory !== 'all' && (
                                    <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-500 hover:underline">添加一�?</button>
                                )}
                            </>
                        )}
                    </div>
                 ) : (
                    isSortingMode === selectedCategory ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={displayedLinks.map(link => link.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div className={`grid gap-3 ${
                                  siteSettings.cardStyle === 'detailed' 
                                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
                                    : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
                                }`}>
                                    {displayedLinks.map(link => (
                                        <SortableLinkCard key={link.id} link={link} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    ) : (
                        <div className={`grid gap-3 ${
                          siteSettings.cardStyle === 'detailed' 
                            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
                            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
                        }`}>
                            {displayedLinks.map(link => renderLinkCard(link))}
                        </div>
                    )
                 )}
            </section>
            )}

            {/* 其他目录搜索结果区域 */}
            {searchQuery.trim() && selectedCategory !== 'all' && (
              <section className="mt-8 pt-8 border-t-2 border-slate-200 dark:border-slate-700">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-folder-search">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <path d="M11 11h.01"></path>
                  </svg>
                  其他目录搜索结果
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-full">
                    {Object.values(otherCategoryResults).flat().length}
                  </span>
                </h2>

                {Object.keys(otherCategoryResults).length > 0 ? (
                  Object.entries(otherCategoryResults).map(([categoryId, links]) => {
                    const category = categories.find(c => c.id === categoryId);
                    if (!category) return null;

                    // 递归获取子目录中的链�?
                    const subCategoryLinks: Record<string, LinkItem[]> = {};
                    const traverseCategories = (cats: Category[]) => {
                      cats.forEach(cat => {
                        if (cat.id === categoryId) {
                          if (cat.subCategories && cat.subCategories.length > 0) {
                            const subCatLinks: LinkItem[] = [];
                            const subTraverse = (subCats: Category[]) => {
                              subCats.forEach(subCat => {
                                const subLinks = otherCategoryResults[subCat.id] || [];
                                subCatLinks.push(...subLinks);
                                if (subCat.subCategories && subCat.subCategories.length > 0) {
                                  subTraverse(subCat.subCategories);
                                }
                              });
                            };
                            subTraverse(cat.subCategories);
                            subCategoryLinks[categoryId] = subCatLinks;
                          }
                        } else if (cat.subCategories && cat.subCategories.length > 0) {
                          traverseCategories(cat.subCategories);
                        }
                      });
                    };
                    traverseCategories(categories);

                    return (
                      <div key={categoryId} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {category.name}
                          </h3>
                          <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full">
                            {links.length}
                          </span>
                        </div>

                        <div className={`grid gap-3 ${
                          siteSettings.cardStyle === 'detailed' 
                            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' 
                            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
                        }`}>
                          {links.map(link => renderLinkCard(link))}
                        </div>
                        
                        {/* 渲染子目�?*/}
                        {category.subCategories && category.subCategories.length > 0 && (
                          <div className="mt-6">
                            {category.subCategories.map((subCat) => (
                              <div key={subCat.id} className="mb-4 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                    <Icon name={subCat.icon} size={12} /> {subCat.name}
                                  </h4>
                                  <span className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-500 rounded-full">
                                    {(otherCategoryResults[subCat.id] || []).length}
                                  </span>
                                </div>
                                
                                {otherCategoryResults[subCat.id] && (
                                  <div className={`grid gap-2 ${
                                    siteSettings.cardStyle === 'detailed' 
                                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' 
                                      : 'grid-cols-2 md:grid-cols-4'
                                  }`}>
                                    {otherCategoryResults[subCat.id].map(link => renderLinkCard(link))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-30 mb-4">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <p className="text-sm">其他目录中没有找到相关内�?/p>
                  </div>
                )}
              </section>
            )}
        </div>
      </main>

          <LinkModal
            isOpen={isModalOpen}
            onClose={() => { setIsModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }}
            onSave={editingLink ? handleEditLink : handleAddLink}
            onDelete={editingLink ? handleDeleteLink : undefined}
            categories={categories}
            initialData={editingLink || (prefillLink as LinkItem)}
            aiConfig={aiConfig}
            defaultCategoryId={selectedCategory !== 'all' ? selectedCategory : undefined}
          />

          {/* 右键菜单 */}
          <ContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            onClose={closeContextMenu}
            onCopyLink={copyLinkToClipboard}
            onShowQRCode={showQRCode}
            onEditLink={editLinkFromContextMenu}
            onDeleteLink={deleteLinkFromContextMenu}
            onTogglePin={togglePinFromContextMenu}
          />

          {/* 二维码模态框 */}
          <QRCodeModal
            isOpen={qrCodeModal.isOpen}
            url={qrCodeModal.url || ''}
            title={qrCodeModal.title || ''}
            onClose={() => setQrCodeModal({ isOpen: false, url: '', title: '' })}
          />
        </>
      )}
    </div>
  );
}

export default App;

