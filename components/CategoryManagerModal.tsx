import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown, Edit2, Trash2, Palette, Lock, Check } from 'lucide-react';
import { Category, LinkItem } from '../types';
import Icon from './Icon';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (categories: Category[]) => void;
  authToken: string | null;
  unlockedCategoryIds: Set<string>;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  authToken,
  unlockedCategoryIds,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Folder');
  const [editPassword, setEditPassword] = useState('');
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
        body: JSON.stringify({ categories: updatedCategories })
      });
      if (!response.ok) throw new Error('保存失败');
      setIsSubCatAddOpen(false);
      setNewSubCatName('');
    } catch (error) {
      alert('保存失败，请检查网络');
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditPassword(cat.password || '');
  };

  const saveEdit = () => {
    const updated = categories.map(c => c.id === editingId ? { ...c, name: editName, icon: editIcon, password: editPassword } : c);
    onUpdateCategories(updated);
    setEditingId(null);
  };

  const handleDeleteClick = (cat: Category) => {
    setPendingAction({ type: 'delete', categoryId: cat.id, categoryName: cat.name });
    setIsAuthModalOpen(true);
  };

  const confirmDelete = () => {
    if (!pendingAction) return;
    const updated = categories.filter(c => c.id !== pendingAction.categoryId);
    onUpdateCategories(updated);
    setIsAuthModalOpen(false);
    setPendingAction(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">分类管理</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories.map((cat, index) => (
            <div key={cat.id} className="flex flex-col p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group gap-2">
              <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 mr-2">
                    <button onClick={() => handleMove(index, 'up')} disabled={index === 0} className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button onClick={() => handleMove(index, 'down')} disabled={index === categories.length - 1} className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"><ArrowDown size={14} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === cat.id && cat.id !== 'common' ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Icon name={editIcon} size={16} />
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none" autoFocus />
                          <button type="button" className="p-1 text-slate-400 hover:text-blue-600 transition-colors" onClick={() => {}}><Palette size={16} /></button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock size={14} className="text-slate-400" />
                          <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none" placeholder="密码（可选）" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Icon name={cat.icon} size={16} />
                          <span className="font-medium dark:text-slate-200 truncate">{cat.name}{cat.id === 'common' && <span className="ml-2 text-xs text-slate-400">(默认)</span>}</span>
                          {cat.password && <Lock size={12} className="text-slate-400" />}
                        </div>
                        {cat.id !== 'common' && (
                          <button type="button" onClick={() => { setSelectedCategoryForSub(cat.id); setIsSubCatAddOpen(true); }} className="ml-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors" title="添加子目录">+ 子目录</button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 self-start mt-1 ml-auto">
                    {editingId === cat.id ? <button onClick={saveEdit} className="text-green-500 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200"><Check size={16}/></button> : (
                       <>
                        {cat.id !== 'common' && (
                          <>
                            <button onClick={() => handleStartEdit(cat)} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 rounded"><Edit2 size={14} /></button>
                            <button onClick={() => handleDeleteClick(cat)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded"><Trash2 size={14} /></button>
                          </>
                        )}
                       </>
                    )}
                  </div>
              </div>
            </div>
          ))}
        </div>

        {isSubCatAddOpen && (
          <div className="absolute inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold mb-4 dark:text-white">添加子目录</h4>
              <input 
                type="text" 
                value={newSubCatName} 
                onChange={(e) => setNewSubCatName(e.target.value)} 
                className="w-full p-2 mb-4 rounded border dark:bg-slate-700 dark:text-white outline-none"
                placeholder="输入子目录名称"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsSubCatAddOpen(false)} className="px-4 py-2 text-sm rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-white">取消</button>
                <button onClick={handleAddSubCategory} className="px-4 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600">确定</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManagerModal;
