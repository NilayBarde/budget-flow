import { useEffect, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }: ModalProps) => {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'md:max-w-md',
    md: 'md:max-w-lg',
    lg: 'md:max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={clsx(
        // Base styles
        'relative w-full bg-midnight-800 border-t md:border border-midnight-600 shadow-2xl',
        // Mobile: full-width, slide up from bottom, rounded top corners
        'rounded-t-2xl md:rounded-xl',
        // Mobile: max height with scrolling
        'max-h-[90vh] md:max-h-[85vh]',
        // Desktop: centered with max-width and margin
        'md:mx-4',
        sizes[size],
        // Animation - slide up on mobile
        'animate-slideUp md:animate-fadeIn'
      )}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-midnight-600 bg-midnight-800 rounded-t-2xl md:rounded-t-xl">
          {/* Mobile drag handle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-midnight-600 rounded-full md:hidden" />

          <h2 className="text-lg font-semibold text-slate-100 mt-2 md:mt-0">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target flex items-center justify-center"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="px-4 md:px-6 py-4 overflow-y-auto max-h-[calc(90vh-4rem)] md:max-h-[calc(85vh-4rem)]">
          {children}
        </div>
      </div>
    </div>
  );
};
