import { useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';
import { Card, Button, Input, Modal, Spinner, EmptyState, Badge } from '../components/ui';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../hooks';
import type { Tag as TagType } from '../types';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];

export const Tags = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);

  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const handleOpenModal = useCallback((tag?: TagType) => {
    if (tag) {
      setEditingTag(tag);
      setName(tag.name);
      setColor(tag.color);
    } else {
      setEditingTag(null);
      setName('');
      setColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
    }
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTag(null);
    setName('');
    setColor(TAG_COLORS[0]);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editingTag) {
      await updateTag.mutateAsync({
        id: editingTag.id,
        data: { name, color },
      });
    } else {
      await createTag.mutateAsync({ name, color });
    }

    handleCloseModal();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this tag?')) {
      await deleteTag.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Tags</h1>
          <p className="text-slate-400 mt-1">Create custom tags to organize your transactions</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tag
        </Button>
      </div>

      {/* Tags Grid */}
      {tags && tags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <Card key={tag.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="font-medium text-slate-100">{tag.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleOpenModal(tag)}
                  className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-midnight-700 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No tags created"
          description="Create tags to categorize transactions beyond the default categories. Great for tracking vacations, business expenses, or reimbursables."
          icon={<Tag className="h-8 w-8 text-slate-400" />}
          action={
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Tag
            </Button>
          }
        />
      )}

      {/* Tag Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTag ? 'Edit Tag' : 'Create Tag'}
      >
        <div className="space-y-4">
          <Input
            label="Tag Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Vacation, Business, Reimbursable"
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Color</label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-midnight-800 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">Preview</label>
            <Badge color={color} size="md">{name || 'Tag Name'}</Badge>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={handleCloseModal} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              isLoading={createTag.isPending || updateTag.isPending}
              disabled={!name.trim()}
              className="flex-1"
            >
              {editingTag ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

