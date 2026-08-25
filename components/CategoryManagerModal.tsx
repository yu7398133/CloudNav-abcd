import React, { useState, useMemo } from 'react';
import { X, Edit2, Trash2, Lock, Check, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Category, LinkItem } from '../types';
import Icon from './Icon';
import CategoryActionAuthModal from './CategoryActionAuthModal';

// --- Droppable Sub-Category Zone (for cross-parent moves) ---
interface DroppableSubZoneProps {
  parentId: string;
  children: React.ReactNode;
  isHighlighted?: boolean;
}

const DroppableSubZone: React.FC<DroppableSubZoneProps> = ({ parentId, children, isHighlighted }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `droppable-${parentId}`,
    data: { type: 'parent-zone', parentId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`ml-8 mt-1 space-y-1 border-l-2 pl-3 transition-colors ${
        isOver
          ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 rounded'
          : 'border-slate-200 dark:border-slate-600'
      }`}
    >
      {children}
    </div>
  );
};

// --- Sortable Category Item (First Level) ---
interface SortableCategoryItemProps {
  cat: Category;
  editingId: string | null;
  editName: string;
  editIcon: string;
  editPassword: string;
  onEditNameChange: (v: string) => void;
  onEditIconChange: (v: string) => void;
  onEditPasswordChange: (v: string) => void;
  onStartEdit: (cat: Category) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteClick: (cat: Category) => void;
  onAddSubCategory: (catId: string) => void;
  editingSubId: string | null;
  editSubName: string;
  editSubIcon: string;
  onEditSubNameChange: (v: string) => void;
  onEditSubIconChange: (v: string) => void;
  onStartEditSub: (subCat: Category) => void;
  onSaveEditSub: (parentId: string) => void;
  onCancelEditSub: () => void;
  onDeleteSub: (parentId: string, subId: string) => void;
  activeSubId: string | null;
}

const SortableCategoryItem: React.FC<SortableCategoryItemProps> = ({
  cat, editingId, editName, editIcon, editPassword,
  onEditNameChange, onEditIconChange, onEditPasswordChange,
  onStartEdit, onSaveEdit, onCancelEdit, onDeleteClick, onAddSubCategory,
  editingSubId, editSubName, editSubIcon, onEditSubNameChange, onEditSubIconChange,
  onStartEditSub, onSaveEditSub, onCancelEditSub, onDeleteSub, activeSubId,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  const subCategories = cat.subCategories || [];
  // Check if any sub is being dragged from another parent (show zone even if empty)
  const hasSubs = subCategories.length > 0 || activeSubId !== null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group gap-2 ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 touch-none"
          title="拖动排序"
        >
          <GripVertical size={16} />
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {editingId === cat.id && cat.id !== 'common' ? (
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                <Icon name={editIcon} size={16} />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  className="flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-slate-400" />
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => onEditPasswordChange(e.target.value)}
                  className="flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none"
                  placeholder="密码（可选）"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <Icon name={cat.icon} size={16} />
                <span className="font-medium dark:text-slate-200 truncate">
                  {cat.name}
                  {cat.id === 'common' && <span className="ml-2 text-xs text-slate-400">(默认)</span>}
                </span>
                {cat.password && <Lock size={12} className="text-slate-400 shrink-0" />}
              </div>
              {cat.id !== 'common' && (
                <button
                  type="button"
                  onClick={() => onAddSubCategory(cat.id)}
                  className="ml-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors shrink-0"
                  title="添加子目录"
                >
                  + 子目录
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {editingId === cat.id ? (
            <>
              <button onClick={onSaveEdit} className="text-green-500 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200"><Check size={16} /></button>
              <button onClick={onCancelEdit} className="text-slate-400 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200"><X size={16} /></button>
            </>
          ) : (
            <>
              {cat.id !== 'common' && (
                <>
                  <button onClick={() => onStartEdit(cat)} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 rounded"><Edit2 size={14} /></button>
                  <button onClick={() => onDeleteClick(cat)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded"><Trash2 size={14} /></button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-categories droppable zone */}
      <DroppableSubZone parentId={cat.id}>
        {subCategories.length > 0 ? (
          <SortableContext items={subCategories.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {subCategories.map((subCat) => (
              <SortableSubCategoryItem
                key={subCat.id}
                subCat={subCat}
                parentId={cat.id}
                editingSubId={editingSubId}
                editSubName={editSubName}
                editSubIcon={editSubIcon}
                onEditSubNameChange={onEditSubNameChange}
                onEditSubIconChange={onEditSubIconChange}
                onStartEditSub={onStartEditSub}
                onSaveEditSub={onSaveEditSub}
                onCancelEditSub={onCancelEditSub}
                onDeleteSub={onDeleteSub}
              />
            ))}
          </SortableContext>
        ) : (
          activeSubId && (
            <div className="text-xs text-slate-400 dark:text-slate-500 italic py-1 pl-5">
              拖放到此处移入
            </div>
          )
        )}
      </DroppableSubZone>
    </div>
  );
};

// --- Sortable Sub-Category Item ---
interface SortableSubCategoryItemProps {
  subCat: Category;
  parentId: string;
  editingSubId: string | null;
  editSubName: string;
  editSubIcon: string;
  onEditSubNameChange: (v: string) => void;
  onEditSubIconChange: (v: string) => void;
  onStartEditSub: (subCat: Category) => void;
  onSaveEditSub: (parentId: string) => void;
  onCancelEditSub: () => void;
  onDeleteSub: (parentId: string, subId: string) => void;
}

const SortableSubCategoryItem: React.FC<SortableSubCategoryItemProps> = ({
  subCat, parentId, editingSubId, editSubName, editSubIcon,
  onEditSubNameChange, onEditSubIconChange,
  onStartEditSub, onSaveEditSub, onCancelEditSub, onDeleteSub,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subCat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-1.5 rounded bg-white dark:bg-slate-800 ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
    >
      {/* Drag handle for sub */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 touch-none"
        title="拖动排序"
      >
        <GripVertical size={12} />
      </div>

      {editingSubId === subCat.id ? (
        <>
          <Icon name={editSubIcon} size={12} />
          <input
            type="text"
            value={editSubName}
            onChange={(e) => onEditSubNameChange(e.target.value)}
            className="flex-1 p-1 px-2 text-xs rounded border border-blue-500 dark:bg-slate-700 dark:text-white outline-none"
            autoFocus
          />
          <button onClick={() => onSaveEditSub(parentId)} className="text-green-500 p-1"><Check size={12} /></button>
          <button onClick={onCancelEditSub} className="text-slate-400 p-1"><X size={12} /></button>
        </>
      ) : (
        <>
          <Icon name={subCat.icon} size={12} />
          <span className="text-xs dark:text-slate-300 flex-1">{subCat.name}</span>
          <button onClick={() => onStartEditSub(subCat)} className="p-1 text-slate-400 hover:text-blue-500"><Edit2 size={10} /></button>
          <button onClick={() => onDeleteSub(parentId, subCat.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={10} /></button>
        </>
      )}
    </div>
  );
};

// --- Main Modal ---
interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (categories: Category[]) => void;
  onDeleteCategory: (catId: string) => void;
  onVerifyPassword: (password: string) => Promise<boolean>;
  authToken: string | null;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  onDeleteCategory,
  onVerifyPassword,
  authToken,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Folder');
  const [editPassword, setEditPassword] = useState('');
  const [isSubCatAddOpen, setIsSubCatAddOpen] = useState(false);
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState('');
  const [newSubCatIcon, setNewSubCatIcon] = useState('Folder');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubIcon, setEditSubIcon] = useState('Folder');

  // Auth modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'edit' | 'delete';
    categoryId: string;
    categoryName: string;
  } | null>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build a lookup: subCategoryId -> parentId
  const subToParentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          map.set(sub.id, cat.id);
        }
      }
    }
    return map;
  }, [categories]);

  // All sub-category IDs (for global SortableContext)
  const allSubIds = useMemo(() => {
    const ids: string[] = [];
    for (const cat of categories) {
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          ids.push(sub.id);
        }
      }
    }
    return ids;
  }, [categories]);

  if (!isOpen) return null;

  // --- Drag handlers for first-level categories ---
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Check if this is a sub-category drag
    const isSubDrag = subToParentMap.has(activeIdStr);

    if (isSubDrag) {
      handleSubCategoryDragEnd(activeIdStr, overIdStr);
      return;
    }

    // First-level category reorder
    if (activeIdStr === overIdStr) return;
    const oldIndex = categories.findIndex(c => c.id === activeIdStr);
    const newIndex = categories.findIndex(c => c.id === overIdStr);
    if (oldIndex === -1 || newIndex === -1) return;

    const newCats = arrayMove(categories, oldIndex, newIndex);
    onUpdateCategories(newCats);
  };

  // --- Handle sub-category drag (within parent OR across parents) ---
  const handleSubCategoryDragEnd = (activeSubId: string, overId: string) => {
    const sourceParentId = subToParentMap.get(activeSubId);
    if (!sourceParentId) return;

    let targetParentId: string | null = null;
    let targetIndex = -1;

    // Determine target: dropped on another sub-category, or on a parent droppable zone
    const overAsSubParent = subToParentMap.get(overId);
    if (overAsSubParent) {
      // Dropped on another sub-category → same parent sort or cross-parent
      targetParentId = overAsSubParent;
      const targetSubs = categories.find(c => c.id === targetParentId)?.subCategories || [];
      targetIndex = targetSubs.findIndex(s => s.id === overId);
    } else if (overId.startsWith('droppable-')) {
      // Dropped on a parent droppable zone
      targetParentId = overId.replace('droppable-', '');
      const targetSubs = categories.find(c => c.id === targetParentId)?.subCategories || [];
      targetIndex = targetSubs.length; // append at end
    } else {
      // Dropped on a first-level category item itself
      targetParentId = overId;
      const targetSubs = categories.find(c => c.id === targetParentId)?.subCategories || [];
      targetIndex = targetSubs.length;
    }

    if (!targetParentId) return;

    const sourceParent = categories.find(c => c.id === sourceParentId);
    if (!sourceParent || !sourceParent.subCategories) return;

    const draggedSub = sourceParent.subCategories.find(s => s.id === activeSubId);
    if (!draggedSub) return;

    if (sourceParentId === targetParentId) {
      // Same parent → reorder
      const subs = sourceParent.subCategories;
      const oldIndex = subs.findIndex(s => s.id === activeSubId);
      if (oldIndex === targetIndex) return;
      const newSubs = arrayMove(subs, oldIndex, targetIndex);
      const updated = categories.map(c =>
        c.id === sourceParentId ? { ...c, subCategories: newSubs } : c
      );
      onUpdateCategories(updated);
    } else {
      // Cross-parent move
      const updated = categories.map(c => {
        if (c.id === sourceParentId && c.subCategories) {
          return { ...c, subCategories: c.subCategories.filter(s => s.id !== activeSubId) };
        }
        if (c.id === targetParentId) {
          const existingSubs = c.subCategories || [];
          const newSubs = [...existingSubs];
          const insertAt = Math.min(targetIndex, newSubs.length);
          newSubs.splice(insertAt, 0, draggedSub);
          return { ...c, subCategories: newSubs };
        }
        return c;
      });
      onUpdateCategories(updated);
    }
  };

  // --- Edit handlers ---
  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditPassword(cat.password || '');
  };

  const saveEdit = () => {
    const updated = categories.map(c =>
      c.id === editingId ? { ...c, name: editName, icon: editIcon, password: editPassword } : c
    );
    onUpdateCategories(updated);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  // --- Delete handlers ---
  const handleDeleteClick = (cat: Category) => {
    setPendingAction({ type: 'delete', categoryId: cat.id, categoryName: cat.name });
    setIsAuthModalOpen(true);
  };

  const handleAuthVerified = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'delete') {
      onDeleteCategory(pendingAction.categoryId);
    }
    setIsAuthModalOpen(false);
    setPendingAction(null);
  };

  const handleAuthClose = () => {
    setIsAuthModalOpen(false);
    setPendingAction(null);
  };

  // --- Sub-category handlers ---
  const handleAddSubCategory = (catId: string) => {
    setSelectedCategoryForSub(catId);
    setIsSubCatAddOpen(true);
  };

  const confirmAddSubCategory = async () => {
    if (!selectedCategoryForSub || !newSubCatName.trim()) return;

    const parentCategory = categories.find(c => c.id === selectedCategoryForSub);
    if (!parentCategory) return;

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
    setIsSubCatAddOpen(false);
    setNewSubCatName('');
  };

  const handleStartEditSub = (subCat: Category) => {
    setEditingSubId(subCat.id);
    setEditSubName(subCat.name);
    setEditSubIcon(subCat.icon);
  };

  const saveEditSub = (parentId: string) => {
    const updated = categories.map(c => {
      if (c.id === parentId && c.subCategories) {
        return {
          ...c,
          subCategories: c.subCategories.map(sub =>
            sub.id === editingSubId ? { ...sub, name: editSubName, icon: editSubIcon } : sub
          ),
        };
      }
      return c;
    });
    onUpdateCategories(updated);
    setEditingSubId(null);
  };

  const cancelEditSub = () => {
    setEditingSubId(null);
  };

  const handleDeleteSub = (parentId: string, subId: string) => {
    if (!window.confirm('确定要删除该子目录吗？')) return;
    const updated = categories.map(c => {
      if (c.id === parentId && c.subCategories) {
        return {
          ...c,
          subCategories: c.subCategories.filter(sub => sub.id !== subId),
        };
      }
      return c;
    });
    onUpdateCategories(updated);
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {categories.map((cat) => (
                <SortableCategoryItem
                  key={cat.id}
                  cat={cat}
                  editingId={editingId}
                  editName={editName}
                  editIcon={editIcon}
                  editPassword={editPassword}
                  onEditNameChange={setEditName}
                  onEditIconChange={setEditIcon}
                  onEditPasswordChange={setEditPassword}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onDeleteClick={handleDeleteClick}
                  onAddSubCategory={handleAddSubCategory}
                  editingSubId={editingSubId}
                  editSubName={editSubName}
                  editSubIcon={editSubIcon}
                  onEditSubNameChange={setEditSubName}
                  onEditSubIconChange={setEditSubIcon}
                  onStartEditSub={handleStartEditSub}
                  onSaveEditSub={saveEditSub}
                  onCancelEditSub={cancelEditSub}
                  onDeleteSub={handleDeleteSub}
                  activeSubId={activeId}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Add Sub-Category Modal */}
        {isSubCatAddOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
                <button onClick={confirmAddSubCategory} className="px-4 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600">确定</button>
              </div>
            </div>
          </div>
        )}

        {/* Auth Modal for Delete */}
        <CategoryActionAuthModal
          isOpen={isAuthModalOpen}
          onClose={handleAuthClose}
          onVerify={onVerifyPassword}
          onVerified={handleAuthVerified}
          actionType={pendingAction?.type || 'delete'}
          categoryName={pendingAction?.categoryName || ''}
        />
      </div>
    </div>
  );
};

export default CategoryManagerModal;
