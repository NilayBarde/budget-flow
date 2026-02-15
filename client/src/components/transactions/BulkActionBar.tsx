import { useState, useCallback } from 'react';
import { X, Tag, Check, Split, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { Tag as TagType } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui';

interface BulkActionBarProps {
  selectedCount: number;
  tags: TagType[];
  onAddTag: (tagId: string) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDone: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDeleting?: boolean;
  addedTagIds?: Set<string>;
}

export const BulkActionBar = ({ 
  selectedCount, 
  tags, 
  onAddTag,
  onSplit,
  onDelete,
  onDone,
  onCancel,
  isLoading = false,
  isDeleting = false,
  addedTagIds = new Set(),
}: BulkActionBarProps) => {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleTagSelect = useCallback((tagId: string) => {
    onAddTag(tagId);
    // Don't close the picker - allow adding multiple tags
  }, [onAddTag]);

  const toggleTagPicker = useCallback(() => {
    setShowTagPicker(prev => !prev);
  }, []);

  // Get tags that have been added
  const addedTags = tags.filter(t => addedTagIds.has(t.id));
  const availableTags = tags.filter(t => !addedTagIds.has(t.id));

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-8 z-50 animate-slideUp">
      <div className="bg-midnight-800 border border-midnight-600 rounded-xl shadow-2xl p-4 md:min-w-[400px]">
        <div className="flex items-center justify-between gap-4">
          {/* Selection count */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center">
              <Check className="h-5 w-5 text-accent-400" />
            </div>
            <div>
              <div className="font-medium text-slate-100">
                {selectedCount} transaction{selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div className="text-sm text-slate-400">
                {addedTags.length > 0 
                  ? `${addedTags.length} tag${addedTags.length !== 1 ? 's' : ''} added`
                  : 'Choose tags to add'}
              </div>
            </div>
          </div>

          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
            aria-label="Cancel selection"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Added tags display */}
        {addedTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {addedTags.map(tag => (
              <Badge key={tag.id} color={tag.color} size="sm">
                <Check className="h-3 w-3 mr-1" />
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Split Button */}
          <button
            onClick={onSplit}
            disabled={isLoading}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
              "bg-midnight-700 text-slate-200 hover:bg-midnight-600",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            <Split className="h-4 w-4" />
            Split
          </button>

          {/* Add Tag Button */}
          <div className="relative">
            <button
              onClick={toggleTagPicker}
              disabled={isLoading}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                showTagPicker 
                  ? "bg-accent-500 text-white" 
                  : "bg-midnight-700 text-slate-200 hover:bg-midnight-600",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              <Tag className="h-4 w-4" />
              {isLoading ? 'Adding...' : 'Add Tag'}
            </button>

            {/* Tag picker dropdown */}
            {showTagPicker && !isLoading && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTagPicker(false)} />
                <div className="absolute bottom-full mb-2 left-0 w-56 bg-midnight-700 border border-midnight-600 rounded-lg shadow-xl z-20 py-2 max-h-64 overflow-y-auto">
                  {availableTags.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">
                      {tags.length === 0 
                        ? 'No tags available. Create tags in the Tags page.'
                        : 'All tags have been added!'}
                    </div>
                  ) : (
                    availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => handleTagSelect(tag.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-midnight-600 transition-colors"
                      >
                        <Badge color={tag.color} size="sm">
                          {tag.name}
                        </Badge>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Delete Button */}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                disabled={isDeleting}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                  "bg-rose-600 text-white hover:bg-rose-700",
                  isDeleting && "opacity-50 cursor-not-allowed"
                )}
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-midnight-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isLoading}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                "bg-midnight-700 text-rose-400 hover:bg-midnight-600",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}

          {/* Done button - shown when tags have been added */}
          {addedTags.length > 0 && (
            <Button onClick={onDone} className="ml-auto">
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
