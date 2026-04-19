import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown, Trash2, Edit2, Plus, Check, Lock, Unlock, Palette, Folder } from 'lucide-react';
import { Category } from '../types';
import Icon from './Icon';
import IconSelector from './IconSelector';
import CategoryActionAuthModal from './CategoryActionAuthModal';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (newCategories: Category[]) => void;
  onDeleteCategory: (id: string) => void;
  onVerifyPassword?: (password: string) => Promise<boolean>;
  authToken?: string;
  unlockedCategoryIds?: Set<string>; // 确保传入此参数
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ 
  isOpen, 
  onClose, 
  categories, 
  onUpdateCategories,
  onDeleteCategory,
  onVerifyPassword,
  authToken,
  unlockedCategoryIds = new Set() // 默认空集
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editIcon, setEditIcon] = useState('');
  
  const [newCatName, setNewCatName] = useState('');
  const [newCatPassword, setNewCatPassword] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Folder');
  
  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false);
  const [iconSelectorTarget, setIconSelectorTarget] = useState<'edit' | 'new' | null>(null);
  
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState('');
  const [newSubCatIcon, setNewSubCatIcon] = useState('Folder');
  const [isSubCatAddOpen, setIsSubCatAddOpen] = useState(false);
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'edit' | 'delete';
    categoryId: string;
    categoryName: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newCats = [...categories];
    if (direction === 'up' && index > 0) {
      [newCats[index], newCats[index - 1]] = [newCats[index - 1], newCats[index]];
    } else if (direction === 'down' && index < newCats.length - 1) {
      [newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]];
    }
    onUpdateCategories(newCats);
  };

  const handleAddSubCategory = async () => {
    if (!selectedCategoryForSub || !newSubCatName.trim()) return;
    
    const parentCategory = categories.find(c => c.id === selectedCategoryForSub);
    if (!parentCategory) return;

    const parentLocked = parentCategory.password && !unlockedCategoryIds.has(parentCategory.id);
    if (parentLocked) {
      alert('该目录已锁定，请先输入密码解锁');
      return;
    }

    const newSubCatId = `sub_${Date.now()}`;
    const newSubCategory: Category = {
      id: newSubCatId,
      name: newSubCatName.trim(),
      icon: newSubCatIcon,
    };

    const updatedCategories = categories.map(cat => {
      if (cat.id === parentCategory.id) {
        return { ...cat, subCategories: [...(cat.subCategories || []), newSubCategory] };
      }
      return cat;
    });

    onUpdateCategories(updatedCategories);
    
    try {
      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-password': authToken || ''
        },
        body: JSON.stringify({
          categories: updatedCategories
        })
      });
      
      const result = await response.json();
      if (!result.success) {
        console.error('Failed to save categories:', result.error);
        alert('保存失败，请检查网络连接或认证状态');
      }
    } catch (error) {
      console.error('Error saving categories:', error);
      alert('保存失败，请检查网络连接或认证状态');
    }
    
    setNewSubCatName('');
    setNewSubCatIcon('Folder');
    setSelectedCategoryForSub(null);
    setIsSubCatAddOpen(false);
  };

  const handlePasswordVerification = async (password: string): Promise<boolean> => {
    if (!onVerifyPassword) return true;
    try {
      const isValid = await onVerifyPassword(password);
      return isValid;
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  };

  const handleStartEdit = (cat: Category) => {
    if (!onVerifyPassword) {
      startEdit(cat);
      return;
    }
    setPendingAction({ type: 'edit', categoryId: cat.id, categoryName: cat.name });
    setIsAuthModalOpen(true);
  };

  const handleDeleteClick = (cat: Category) => {
    if (!onVerifyPassword) {
      if (confirm(`确定删除\"${cat.name}\"分类吗？该分类下的书签将移动到\"常用推荐\"。`)) {
        onDeleteCategory(cat.id);
      }
      return;
    }
    setPendingAction({ type: 'delete', categoryId: cat.id, categoryName: cat.name });
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'edit') {
      const cat = categories.find(c => c.id === pendingAction.categoryId);
      if (cat) startEdit(cat);
    } else if (pendingAction.type === 'delete') {
      const cat = categories.find(c => c.id === pendingAction.categoryId);
      if (cat && confirm(`确定删除\"${cat.name}\"分类吗？该分类下的书签将移动到\"常用推荐\"。`)) {
        onDeleteCategory(cat.id);
      }
    }
    setPendingAction(null);
  };

  const handleAuthModalClose = () => {
    setIsAuthModalOpen(false);
    setPendingAction(null);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditPassword(cat.password || '');
    setEditIcon(cat.icon);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const newCats = categories.map(c => c.id === editingId ? { 
        ...c, 
        name: editName.trim(),
        icon: editIcon,
        password: editPassword.trim() || undefined
    } : c);
    onUpdateCategories(newCats);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!newCatName.trim()) return;
    const newCat: Category = {
      id: Date.now().toString(),
      name: newCatName.trim(),
      icon: newCatIcon,
      password: newCatPassword.trim() || undefined
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
    setNewCatPassword('');
    setNewCatIcon('Folder');
  };

  const openIconSelector = (target: 'edit' | 'new') => {
    setIconSelectorTarget(target);
    setIsIconSelectorOpen(true);
  };
  
  const handleIconSelect = (iconName: string) => {
    if (iconSelectorTarget === 'edit') setEditIcon(iconName);
    else if (iconSelectorTarget === 'new') setNewCatIcon(iconName);
  };
  
  const cancelIconSelector = () => {
    setIsIconSelectorOpen(false);
    setIconSelectorTarget(null);
  };
  
  return (
    <div className=\"fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm\">\
      <div className=\"bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]\">\
        <div className=\"flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700\">\
          <h3 className=\"text-lg font-semibold dark:text-white\">分类管理</h3>\
          <button onClick={onClose} className=\"p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors\">\
            <X className=\"w-5 h-5 dark:text-slate-400\" />\
          </button>\
        </div>\
        <div className=\"flex-1 overflow-y-auto p-4 space-y-2\">\
          {categories.map((cat, index) => (\
            <div key={cat.id} className=\"flex flex-col p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group gap-2\">\
              <div className=\"flex items-center gap-2\">\
                  <div className=\"flex flex-col gap-1 mr-2\">\
                    <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className=\"p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30\"><ArrowUp size={14} /></button>\
                    <button onClick={() => handleMove(index, 'down')} disabled={index === categories.length - 1} className=\"p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30\"><ArrowDown size={14} /></button>\
                  </div>\
                  <div className=\"flex items-center gap-2\">\
                    {editingId === cat.id && cat.id !== 'common' ? (\
                      <div className=\"flex flex-col gap-2\">\
                        <div className=\"flex items-center gap-2\">\
                          <Icon name={editIcon} size={16} />\
                          <input type=\"text\" value={editName} onChange={(e) => setEditName(e.target.value)} className=\"flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none\" autoFocus />\
                          <button type=\"button\" className=\"p-1 text-slate-400 hover:text-blue-600 transition-colors\" onClick={() => openIconSelector('edit')}><Palette size={16} /></button>\
                        </div>\
                        <div className=\"flex items-center gap-2\">\
                          <Lock size={14} className=\"text-slate-400\" />\
                          <input type=\"password\" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className=\"flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none\" placeholder=\"密码（可选）\" />\
                        </div>\
                      </div>\
                    ) : (\
                      <>\
                        <div className=\"flex items-center gap-2\">\
                          <Icon name={cat.icon} size={16} />\
                          <span className=\"font-medium dark:text-slate-200 truncate\">{cat.name}{cat.id === 'common' && <span className=\"ml-2 text-xs text-slate-400\">(默认)</span>}</span>\
                          {cat.password && <Lock size={12} className=\"text-slate-400\" />}\
                        </div>\
                        {cat.id !== 'common' && (\
                          <button type=\"button\" onClick={() => { setSelectedCategoryForSub(cat.id); setIsSubCatAddOpen(true); }} className=\"ml-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors\" title=\"添加子目录\">+ 子目录</button>\
                        )}\
                      </>\
                    )}\
                  </div>\
                  <div className=\"flex items-center gap-1 self-start mt-1 ml-auto\">\
                    {editingId === cat.id ? <button onClick={saveEdit} className=\"text-green-500 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200\"><Check size={16}/></button> : (\
                       <>\
                        {cat.id !== 'common' && (\
                          <>\
                            <button onClick={() => handleStartEdit(cat)} className=\"p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 rounded\"><Edit2 size={14} /></button>\
                            <button onClick={() => handleDeleteClick(cat)} className=\"p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded\"><Trash2 size={14} /></button>\
                          </>\
                        )}\
                       </>\
                    )}\
                  </div>\
              </div>\
            </div>\
          ))}\
        </div>\
        {/* 其他代码保持不变... */}\
      </div>\
    </div>\
  );\
};\
export default CategoryManagerModal;
