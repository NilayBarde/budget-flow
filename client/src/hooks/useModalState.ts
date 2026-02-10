import { useState, useCallback } from 'react';

/**
 * Generic hook for managing modal open/close state with an optional item for editing.
 * Eliminates the repeated isOpen + editingItem + open/edit/close boilerplate.
 */
export const useModalState = <T>() => {
  const [isOpen, setIsOpen] = useState(false);
  const [item, setItem] = useState<T | null>(null);

  const open = useCallback(() => {
    setItem(null);
    setIsOpen(true);
  }, []);

  const edit = useCallback((editItem: T) => {
    setItem(editItem);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setItem(null);
  }, []);

  return { isOpen, item, open, edit, close };
};
