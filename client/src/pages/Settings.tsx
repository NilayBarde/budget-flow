import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardHeader, Button, Modal, Input } from '../components/ui';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks';
import type { Category } from '../types';

const DEFAULT_COLORS = [
  '#0ea5e9', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899',
  '#eab308', '#6366f1', '#14b8a6', '#ef4444', '#10b981', '#64748b',
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

export const Settings = () => {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLORS[0]);
  const [categoryIcon, setCategoryIcon] = useState('');

  const handleCreateCategory = useCallback(async () => {
    if (!categoryName.trim()) return;

    try {
      await createCategory.mutateAsync({
        name: categoryName.trim(),
        color: categoryColor,
        icon: categoryIcon || categoryName.trim().charAt(0).toLowerCase(),
      });
      setCategoryName('');
      setCategoryIcon('');
      setCategoryColor(DEFAULT_COLORS[0]);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  }, [categoryName, categoryColor, categoryIcon, createCategory]);

  const handleEditCategory = useCallback((category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryColor(category.color);
    setCategoryIcon(category.icon);
    setIsEditModalOpen(true);
  }, []);

  const handleUpdateCategory = useCallback(async () => {
    if (!categoryName.trim() || !editingCategory) return;

    try {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        data: {
          name: categoryName.trim(),
          color: categoryColor,
          icon: categoryIcon || categoryName.trim().charAt(0).toLowerCase(),
        },
      });
      setCategoryName('');
      setCategoryIcon('');
      setCategoryColor(DEFAULT_COLORS[0]);
      setEditingCategory(null);
      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  }, [categoryName, categoryColor, categoryIcon, editingCategory, updateCategory]);

  const handleDeleteCategory = useCallback(async (category: Category) => {
    if (category.is_default) {
      alert('Cannot delete default category');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${category.name}"?`)) {
      return;
    }

    try {
      await deleteCategory.mutateAsync(category.id);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category');
    }
  }, [deleteCategory]);

  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryIcon('');
    setCategoryColor(DEFAULT_COLORS[0]);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your preferences and data</p>
      </div>

      {/* Categories */}
      <Card>
        <CardHeader 
          title="Categories" 
          subtitle="Default categories for organizing transactions"
          action={
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(categories || []).map(category => (
            <div 
              key={category.id}
              className="flex items-center justify-between gap-2 bg-midnight-900 rounded-lg px-3 py-2 group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm text-slate-200 truncate">{category.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditCategory(category)}
                  className="p-1 hover:bg-midnight-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
                  title="Edit category"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {!category.is_default && (
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="p-1 hover:bg-midnight-700 rounded text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete category"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Create Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Category"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g., Alcohol"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateCategory();
              }
            }}
          />
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Color
            </label>
            <div className="grid grid-cols-8 gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCategoryColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    categoryColor === color ? 'border-slate-300 scale-110' : 'border-midnight-600'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreateCategory}
              disabled={!categoryName.trim() || createCategory.isPending}
              className="flex-1"
            >
              {createCategory.isPending ? 'Creating...' : 'Create Category'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        title="Edit Category"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g., Alcohol"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleUpdateCategory();
              }
            }}
          />
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Color
            </label>
            <div className="grid grid-cols-8 gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCategoryColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    categoryColor === color ? 'border-slate-300 scale-110' : 'border-midnight-600'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleUpdateCategory}
              disabled={!categoryName.trim() || updateCategory.isPending}
              className="flex-1"
            >
              {updateCategory.isPending ? 'Updating...' : 'Update Category'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleCloseEditModal}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Data Management */}
      <Card>
        <CardHeader 
          title="Data Management" 
          subtitle="Export or clear your data"
        />
        <div className="flex gap-4">
          <Button variant="secondary">
            Export All Data
          </Button>
          <Button variant="danger">
            Clear All Data
          </Button>
        </div>
      </Card>

      {/* About */}
      <Card>
        <CardHeader 
          title="About" 
          subtitle="BudgetFlow - Personal Finance Tracker"
        />
        <div className="space-y-2 text-sm text-slate-400">
          <p>Version 1.0.0</p>
          <p>Built with React, TypeScript, and TailwindCSS</p>
          <p>Bank connections powered by Plaid</p>
        </div>
      </Card>
    </div>
  );
};

