import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal, Button } from '../ui';
import { usePreviewHoldingsImport, useImportHoldings } from '../../hooks';
import type { HoldingsPreviewItem } from '../../services/api';
import type { Account } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface HoldingsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
}

type Step = 'upload' | 'preview' | 'importing' | 'complete';

export const HoldingsImportModal = ({ isOpen, onClose, account }: HoldingsImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{
    holdings: HoldingsPreviewItem[];
    count: number;
    totalValue: number;
    totalCostBasis: number;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    totalValue: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewHoldings = usePreviewHoldingsImport();
  const importHoldings = useImportHoldings();

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
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
      const result = await previewHoldings.mutateAsync({
        accountId: account.id,
        file: selectedFile,
      });

      setPreviewData(result);
      setStep('preview');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to preview file';
      setError(errorMessage);
    }
  }, [account.id, previewHoldings]);

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
      const result = await importHoldings.mutateAsync({
        accountId: account.id,
        file,
      });

      setImportResult(result);
      setStep('complete');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import holdings';
      setError(errorMessage);
      setStep('preview');
    }
  }, [account.id, file, importHoldings]);

  const renderUploadStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Upload a positions CSV exported from {account.institution_name}. 
        The file should include columns like Symbol, Description, Quantity, Last Price, and Current Value.
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
          Drop your positions CSV here or click to browse
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

      {previewHoldings.isPending && (
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

    const holdingsToShow = previewData.holdings.slice(0, 15);
    const hasMore = previewData.holdings.length > 15;

    return (
      <div className="space-y-4">
        {/* File info */}
        <div className="flex items-center gap-3 p-3 bg-midnight-700 rounded-lg">
          <FileText className="h-5 w-5 text-slate-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
            <p className="text-xs text-slate-400">
              {previewData.count} holdings found
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetState}>
            Change
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
            <span className="text-sm text-violet-400">Total Value</span>
            <p className="text-2xl font-bold text-violet-400 mt-1">
              {formatCurrency(previewData.totalValue)}
            </p>
          </div>
          {previewData.totalCostBasis > 0 && (
            <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-lg">
              <span className="text-sm text-slate-400">Cost Basis</span>
              <p className="text-2xl font-bold text-slate-300 mt-1">
                {formatCurrency(previewData.totalCostBasis)}
              </p>
            </div>
          )}
        </div>

        {/* Preview table */}
        <div className="border border-midnight-600 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-midnight-700 sticky top-0">
                <tr>
                  <th className="text-left p-2 text-slate-400 font-medium">Symbol</th>
                  <th className="text-left p-2 text-slate-400 font-medium">Name</th>
                  <th className="text-right p-2 text-slate-400 font-medium">Shares</th>
                  <th className="text-right p-2 text-slate-400 font-medium">Price</th>
                  <th className="text-right p-2 text-slate-400 font-medium">Value</th>
                  {previewData.totalCostBasis > 0 && (
                    <th className="text-right p-2 text-slate-400 font-medium">Cost Basis</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-midnight-700">
                {holdingsToShow.map((h, idx) => (
                  <tr key={idx}>
                    <td className="p-2 text-slate-200 font-medium whitespace-nowrap">
                      {h.symbol}
                    </td>
                    <td className="p-2 text-slate-300 max-w-[180px] truncate">
                      {h.name}
                    </td>
                    <td className="p-2 text-right text-slate-300 whitespace-nowrap">
                      {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="p-2 text-right text-slate-300 whitespace-nowrap">
                      {h.price > 0 ? formatCurrency(h.price) : '-'}
                    </td>
                    <td className="p-2 text-right text-slate-200 font-medium whitespace-nowrap">
                      {formatCurrency(h.value)}
                    </td>
                    {previewData.totalCostBasis > 0 && (
                      <td className="p-2 text-right text-slate-400 whitespace-nowrap">
                        {h.costBasis > 0 ? formatCurrency(h.costBasis) : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-2 bg-midnight-700 text-center text-sm text-slate-400">
              ... and {previewData.holdings.length - 15} more holdings
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Importing will replace all existing holdings for this account with the data above.
        </p>

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
          <Button onClick={handleImport} className="flex-1">
            Import {previewData.count} Holdings
          </Button>
        </div>
      </div>
    );
  };

  const renderImportingStep = () => (
    <div className="py-12 text-center">
      <div className="animate-spin h-12 w-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
      <p className="text-lg font-medium text-slate-200">Importing holdings...</p>
      <p className="text-sm text-slate-400 mt-1">This may take a moment</p>
    </div>
  );

  const renderCompleteStep = () => {
    if (!importResult) return null;

    return (
      <div className="space-y-4">
        <div className="py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-200">Import complete!</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
            <p className="text-2xl font-bold text-emerald-400">{importResult.imported}</p>
            <p className="text-sm text-emerald-400">Holdings Imported</p>
          </div>
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg text-center">
            <p className="text-2xl font-bold text-violet-400">{formatCurrency(importResult.totalValue)}</p>
            <p className="text-sm text-violet-400">Total Value</p>
          </div>
        </div>

        <p className="text-sm text-slate-400 text-center">
          Your holdings are now visible on the Investments page and count toward your net worth.
        </p>

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
        return `Import Holdings - ${account.institution_name}`;
      case 'preview':
        return 'Preview Holdings';
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
