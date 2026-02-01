import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Modal, Button, Badge } from '../ui';
import { usePreviewCsvImport, useImportCsv } from '../../hooks';
import type { CsvPreviewTransaction } from '../../services/api';
import type { Account } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
}

type Step = 'upload' | 'preview' | 'importing' | 'complete';

const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  expense: 'bg-rose-500/20 text-rose-400',
  income: 'bg-emerald-500/20 text-emerald-400',
  return: 'bg-teal-500/20 text-teal-400',
  transfer: 'bg-slate-500/20 text-slate-400',
  investment: 'bg-violet-500/20 text-violet-400',
};

export const CsvImportModal = ({ isOpen, onClose, account }: CsvImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{
    transactions: CsvPreviewTransaction[];
    duplicateCount: number;
    newCount: number;
  } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCsv = usePreviewCsvImport();
  const importCsv = useImportCsv();

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
    setSkipDuplicates(true);
    setImportResult(null);
    setError(null);
    setIsDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);

    try {
      const result = await previewCsv.mutateAsync({
        accountId: account.id,
        file: selectedFile,
      });

      setPreviewData({
        transactions: result.transactions,
        duplicateCount: result.duplicateCount,
        newCount: result.newCount,
      });
      setStep('preview');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to preview file';
      setError(errorMessage);
    }
  }, [account.id, previewCsv]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith('.csv')) {
      handleFileSelect(droppedFile);
    } else {
      setError('Please drop a CSV file');
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!file) return;

    setStep('importing');
    setError(null);

    try {
      const result = await importCsv.mutateAsync({
        accountId: account.id,
        file,
        skipDuplicates,
      });

      setImportResult({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      });
      setStep('complete');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import file';
      setError(errorMessage);
      setStep('preview');
    }
  }, [account.id, file, importCsv, skipDuplicates]);

  const renderUploadStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Upload a CSV file exported from your bank. Supported formats: American Express, 
        and most standard CSV files with Date, Description, and Amount columns.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          isDragOver
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-midnight-600 hover:border-midnight-500 hover:bg-midnight-700/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <Upload className={`h-10 w-10 mx-auto mb-3 ${isDragOver ? 'text-primary-400' : 'text-slate-400'}`} />
        <p className="text-slate-200 font-medium">
          Drop your CSV file here or click to browse
        </p>
        <p className="text-sm text-slate-500 mt-1">
          CSV files only, up to 5MB
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {previewCsv.isPending && (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="animate-spin h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full" />
          <span className="text-slate-400">Analyzing file...</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    if (!previewData || !file) return null;

    const transactionsToShow = previewData.transactions.slice(0, 10);
    const hasMore = previewData.transactions.length > 10;

    return (
      <div className="space-y-4">
        {/* File info */}
        <div className="flex items-center gap-3 p-3 bg-midnight-700 rounded-lg">
          <FileText className="h-5 w-5 text-slate-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">
              {previewData.transactions.length} transactions found
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetState}>
            Change
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">New</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{previewData.newCount}</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-amber-400">Duplicates</span>
            </div>
            <p className="text-2xl font-bold text-amber-400 mt-1">{previewData.duplicateCount}</p>
          </div>
        </div>

        {/* Preview table */}
        <div className="border border-midnight-600 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-midnight-700 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-slate-400 font-medium">Date</th>
                  <th className="text-left p-2 text-slate-400 font-medium">Description</th>
                  <th className="text-right p-2 text-slate-400 font-medium">Amount</th>
                  <th className="text-left p-2 text-slate-400 font-medium">Type</th>
                  <th className="text-left p-2 text-slate-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-midnight-700">
                {transactionsToShow.map((tx, idx) => (
                  <tr key={idx} className={tx.isDuplicate ? 'opacity-50' : ''}>
                    <td className="p-2 text-slate-300 whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="p-2 text-slate-200 max-w-[200px] truncate">
                      {tx.description}
                    </td>
                    <td className={`p-2 text-right whitespace-nowrap ${
                      tx.amount < 0 ? 'text-emerald-400' : 'text-slate-200'
                    }`}>
                      {formatCurrency(Math.abs(tx.amount))}
                    </td>
                    <td className="p-2">
                      <Badge className={TRANSACTION_TYPE_COLORS[tx.transactionType]}>
                        {tx.transactionType}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {tx.isDuplicate ? (
                        <Badge className="bg-amber-500/20 text-amber-400">Duplicate</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/20 text-emerald-400">New</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-2 bg-midnight-700 text-center text-sm text-slate-400">
              ... and {previewData.transactions.length - 10} more transactions
            </div>
          )}
        </div>

        {/* Options */}
        {previewData.duplicateCount > 0 && (
          <label className="flex items-center gap-2 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={e => setSkipDuplicates(e.target.checked)}
              className="w-5 h-5 md:w-4 md:h-4 rounded border-slate-600 bg-midnight-700 text-primary-500 focus:ring-primary-500/20"
            />
            <span className="text-sm text-slate-300">
              Skip {previewData.duplicateCount} duplicate transactions
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            className="flex-1"
            disabled={skipDuplicates && previewData.newCount === 0}
          >
            Import {skipDuplicates ? previewData.newCount : previewData.transactions.length} Transactions
          </Button>
        </div>
      </div>
    );
  };

  const renderImportingStep = () => (
    <div className="py-12 text-center">
      <div className="animate-spin h-12 w-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
      <p className="text-lg font-medium text-slate-200">Importing transactions...</p>
      <p className="text-sm text-slate-400 mt-1">This may take a moment</p>
    </div>
  );

  const renderCompleteStep = () => {
    if (!importResult) return null;

    const hasErrors = importResult.errors.length > 0;

    return (
      <div className="space-y-4">
        <div className="py-6 text-center">
          {hasErrors ? (
            <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          ) : (
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          )}
          <p className="text-lg font-medium text-slate-200">
            {hasErrors ? 'Import completed with warnings' : 'Import complete!'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
            <p className="text-2xl font-bold text-emerald-400">{importResult.imported}</p>
            <p className="text-sm text-emerald-400">Imported</p>
          </div>
          <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-lg text-center">
            <p className="text-2xl font-bold text-slate-400">{importResult.skipped}</p>
            <p className="text-sm text-slate-400">Skipped</p>
          </div>
        </div>

        {hasErrors && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-rose-400" />
              <span className="text-sm font-medium text-rose-400">
                {importResult.errors.length} errors
              </span>
            </div>
            <ul className="text-xs text-rose-400 space-y-1">
              {importResult.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleClose}>
            Done
          </Button>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    switch (step) {
      case 'upload':
        return `Import CSV - ${account.institution_name}`;
      case 'preview':
        return 'Preview Import';
      case 'importing':
        return 'Importing...';
      case 'complete':
        return 'Import Complete';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getTitle()} size="lg">
      {step === 'upload' && renderUploadStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'importing' && renderImportingStep()}
      {step === 'complete' && renderCompleteStep()}
    </Modal>
  );
};
