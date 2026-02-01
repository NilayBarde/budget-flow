import { useState, useCallback } from 'react';
import { History, Trash2, AlertCircle, FileText } from 'lucide-react';
import { Modal, Button, Spinner } from '../ui';
import { useCsvImports, useDeleteCsvImport } from '../../hooks';
import type { Account } from '../../types';
import { formatDate } from '../../utils/formatters';

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
}

export const ImportHistoryModal = ({ isOpen, onClose, account }: ImportHistoryModalProps) => {
  const { data: imports, isLoading } = useCsvImports(account.id);
  const deleteImport = useDeleteCsvImport();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = useCallback(async (importId: string) => {
    setDeletingId(importId);
    try {
      await deleteImport.mutateAsync(importId);
      setConfirmDelete(null);
    } catch (error) {
      console.error('Failed to delete import:', error);
    } finally {
      setDeletingId(null);
    }
  }, [deleteImport]);

  const handleClose = useCallback(() => {
    setConfirmDelete(null);
    onClose();
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Import History - ${account.institution_name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          View and manage your CSV imports. Deleting an import will remove all transactions that were imported with it.
        </p>

        {isLoading ? (
          <Spinner className="py-8" />
        ) : imports && imports.length > 0 ? (
          <div className="space-y-2">
            {imports.map((importRecord) => (
              <div
                key={importRecord.id}
                className="flex items-center gap-3 p-3 bg-midnight-700 rounded-lg"
              >
                <div className="p-2 bg-midnight-600 rounded-lg">
                  <FileText className="h-4 w-4 text-slate-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {importRecord.file_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {importRecord.transaction_count} transactions • {formatDate(importRecord.created_at)}
                  </p>
                </div>

                {confirmDelete === importRecord.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(importRecord.id)}
                      isLoading={deletingId === importRecord.id}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(null)}
                      disabled={deletingId === importRecord.id}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(importRecord.id)}
                    className="text-slate-400 hover:text-rose-400"
                    title="Undo this import"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <History className="h-10 w-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">No imports yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Import a CSV file to see it here
            </p>
          </div>
        )}

        {confirmDelete && (
          <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-rose-400">
              This will permanently delete all transactions from this import. This action cannot be undone.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
