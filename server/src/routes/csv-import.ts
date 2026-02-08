import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { supabase } from '../db/supabase.js';
import { categorizeWithPlaid, cleanMerchantName } from '../services/categorizer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Configure multer for memory storage (we'll process the file in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'return';

// Transfer detection patterns
const TRANSFER_PATTERNS = [
  /credit\s*card[- ]?auto[- ]?pay/i,
  /credit\s*card[- ]?payment/i,
  /card[- ]?payment/i,
  /payment.*thank\s*you/i,
  /autopay/i,
  /auto[- ]?pay/i,
  /\btransfer\b/i,
  /bill\s*pay/i,
  /zelle/i,
];

// Investment detection patterns
const INVESTMENT_PATTERNS = [
  /robinhood/i,
  /fidelity/i,
  /vanguard/i,
  /schwab/i,
  /coinbase/i,
  /webull/i,
  /acorns/i,
  /betterment/i,
];

// Detect transaction type based on description and amount
const detectTransactionType = (description: string, amount: number): TransactionType => {
  const matchesTransfer = TRANSFER_PATTERNS.some(p => p.test(description));
  if (matchesTransfer) return 'transfer';

  const matchesInvestment = INVESTMENT_PATTERNS.some(p => p.test(description));
  if (matchesInvestment) return 'investment';

  // Negative amount = money coming in (for credit cards, payments reduce balance)
  if (amount < 0) return 'return';

  return 'expense';
};

// Column mapping types for different CSV formats
interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  extendedDetails?: string;
  reference?: string;
}

// Known CSV formats and their column mappings
const CSV_FORMATS: Record<string, ColumnMapping> = {
  amex: {
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    extendedDetails: 'Extended Details',
  },
  generic: {
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
  },
};

// Try to detect the CSV format based on headers
const detectFormat = (headers: string[]): ColumnMapping | null => {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  // AMEX format: Date, Description, Amount (and optionally Extended Details, Reference)
  if (
    normalizedHeaders.includes('date') &&
    normalizedHeaders.includes('description') &&
    normalizedHeaders.includes('amount')
  ) {
    const mapping: ColumnMapping = {
      date: headers[normalizedHeaders.indexOf('date')],
      description: headers[normalizedHeaders.indexOf('description')],
      amount: headers[normalizedHeaders.indexOf('amount')],
    };
    
    if (normalizedHeaders.includes('extended details')) {
      mapping.extendedDetails = headers[normalizedHeaders.indexOf('extended details')];
    }

    if (normalizedHeaders.includes('reference')) {
      mapping.reference = headers[normalizedHeaders.indexOf('reference')];
    }
    
    return mapping;
  }

  // Try alternative column names
  const dateCol = headers.find(h => 
    /^(date|trans(action)?[\s_-]?date|posted[\s_-]?date)$/i.test(h.trim())
  );
  const descCol = headers.find(h => 
    /^(description|merchant|payee|memo|name)$/i.test(h.trim())
  );
  const amountCol = headers.find(h => 
    /^(amount|debit|credit|charge)$/i.test(h.trim())
  );

  if (dateCol && descCol && amountCol) {
    const refCol = headers.find(h =>
      /^(reference|ref|transaction[\s_-]?id|confirmation)$/i.test(h.trim())
    );
    const mapping: ColumnMapping = {
      date: dateCol,
      description: descCol,
      amount: amountCol,
    };
    if (refCol) mapping.reference = refCol;
    return mapping;
  }

  return null;
};

// Parse date string in various formats
const parseDate = (dateStr: string): string => {
  // Try common date formats
  const cleaned = dateStr.trim();
  
  // MM/DD/YYYY or MM-DD-YYYY
  const usFormat = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const usMatch = cleaned.match(usFormat);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // YYYY-MM-DD (ISO format)
  const isoFormat = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (isoFormat.test(cleaned)) {
    return cleaned;
  }

  // Try to parse with Date object as fallback
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  throw new Error(`Unable to parse date: ${dateStr}`);
};

// Parse amount (handle different formats like -$100.00 or ($100.00))
const parseAmount = (amountStr: string): number => {
  let cleaned = amountStr.trim();
  
  // Handle parentheses for negative (accounting format)
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegative) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove currency symbols and commas
  cleaned = cleaned.replace(/[$,]/g, '');
  
  // Handle negative sign
  const hasNegativeSign = cleaned.startsWith('-');
  if (hasNegativeSign) {
    cleaned = cleaned.slice(1);
  }
  
  const amount = parseFloat(cleaned);
  if (isNaN(amount)) {
    throw new Error(`Unable to parse amount: ${amountStr}`);
  }
  
  return (isNegative || hasNegativeSign) ? -amount : amount;
};

// Generate a unique hash for duplicate detection
const generateTransactionHash = (date: string, description: string, amount: number): string => {
  return `${date}|${description.toLowerCase().trim()}|${amount.toFixed(2)}`;
};

// Generate a looser hash for fuzzy duplicate detection (date + amount only)
const generateLooseHash = (date: string, amount: number): string => {
  return `${date}|${amount.toFixed(2)}`;
};

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  extendedDetails?: string;
  transactionType: TransactionType;
  categoryName: string | null;
  needsReview: boolean;
  hash: string;
  isDuplicate: boolean;
}

interface PreviewResponse {
  success: boolean;
  format: string;
  totalRows: number;
  transactions: ParsedTransaction[];
  duplicateCount: number;
  newCount: number;
}

interface ImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  importId?: string;
}

interface CsvImport {
  id: string;
  account_id: string;
  file_name: string;
  transaction_count: number;
  created_at: string;
}

// Preview CSV import (parse and show what will be imported)
router.post('/:accountId/preview', upload.single('file'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify account exists
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, institution_name')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Parse CSV
    const csvContent = file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty' });
    }

    // Detect format from headers
    const headers = Object.keys(records[0]);
    const mapping = detectFormat(headers);

    if (!mapping) {
      return res.status(400).json({ 
        message: 'Unable to detect CSV format. Expected columns: Date, Description, Amount',
        headers,
      });
    }

    // Get existing transactions for duplicate detection
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('date, merchant_name, original_description, merchant_display_name, amount, csv_reference')
      .eq('account_id', accountId);

    const existingHashes = new Set<string>();
    const existingReferences = new Set<string>();
    // Build a map of loose hashes (date+amount) to count for fuzzy matching
    const existingLooseCounts = new Map<string, number>();

    existingTransactions?.forEach(t => {
      existingHashes.add(generateTransactionHash(t.date, t.merchant_name, t.amount));
      if (t.original_description) {
        existingHashes.add(generateTransactionHash(t.date, t.original_description, t.amount));
      }
      if (t.merchant_display_name) {
        existingHashes.add(generateTransactionHash(t.date, t.merchant_display_name, t.amount));
      }
      if (t.csv_reference) {
        existingReferences.add(t.csv_reference);
      }
      const looseKey = generateLooseHash(t.date, t.amount);
      existingLooseCounts.set(looseKey, (existingLooseCounts.get(looseKey) || 0) + 1);
    });

    // Get categories for categorization
    const { data: categories } = await supabase.from('categories').select('id, name');
    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

    // Parse transactions
    const transactions: ParsedTransaction[] = [];
    let duplicateCount = 0;
    // Track loose hashes within the CSV itself for intra-file duplicate detection
    const csvLooseCounts = new Map<string, number>();

    for (const record of records) {
      try {
        const date = parseDate(record[mapping.date]);
        const description = record[mapping.description] || '';
        const amount = parseAmount(record[mapping.amount]);
        const extendedDetails = mapping.extendedDetails ? record[mapping.extendedDetails] : undefined;
        const reference = mapping.reference ? record[mapping.reference]?.replace(/'/g, '').trim() : undefined;

        const hash = reference || generateTransactionHash(date, description, amount);

        // Strategy 1: Exact match on csv_reference
        let isDuplicate = !!reference && existingReferences.has(reference);

        // Strategy 2: Hash-based matching on description variants
        if (!isDuplicate) {
          const descHash = generateTransactionHash(date, description, amount);
          const displayNameHash = generateTransactionHash(date, cleanMerchantName(description), amount);
          isDuplicate = existingHashes.has(descHash) || existingHashes.has(displayNameHash);
        }

        // Strategy 3: Fuzzy match — same date + same amount already exists in DB
        if (!isDuplicate) {
          const looseKey = generateLooseHash(date, amount);
          const existingCount = existingLooseCounts.get(looseKey) || 0;
          const csvCount = csvLooseCounts.get(looseKey) || 0;
          if (existingCount > csvCount) {
            isDuplicate = true;
          }
          csvLooseCounts.set(looseKey, csvCount + 1);
        }

        if (isDuplicate) {
          duplicateCount++;
        }

        const transactionType = detectTransactionType(description, amount);
        
        // Categorize the transaction - only expenses and returns get categories
        // Income, investment, and transfer types don't need categories - the type is sufficient
        let categoryName: string | null = null;
        let needsReview = false;

        if (transactionType === 'expense' || transactionType === 'return') {
          const result = categorizeWithPlaid(description, extendedDetails || null, null);
          categoryName = result.categoryName;
          needsReview = result.needsReview;
        }

        transactions.push({
          date,
          description,
          amount,
          extendedDetails,
          transactionType,
          categoryName,
          needsReview,
          hash,
          isDuplicate,
        });
      } catch (parseError) {
        console.error('Error parsing row:', record, parseError);
        // Continue with other rows
      }
    }

    const response: PreviewResponse = {
      success: true,
      format: 'detected',
      totalRows: records.length,
      transactions,
      duplicateCount,
      newCount: transactions.length - duplicateCount,
    };

    res.json(response);
  } catch (error) {
    console.error('Error previewing CSV:', error);
    res.status(500).json({ message: 'Failed to preview CSV file' });
  }
});

// Import transactions from CSV
router.post('/:accountId/import', upload.single('file'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const { skipDuplicates = true } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify account exists
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Parse CSV
    const csvContent = file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty' });
    }

    // Detect format
    const headers = Object.keys(records[0]);
    const mapping = detectFormat(headers);

    if (!mapping) {
      return res.status(400).json({ 
        message: 'Unable to detect CSV format',
        headers,
      });
    }

    // Get existing transactions for duplicate detection
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('date, merchant_name, original_description, merchant_display_name, amount, csv_reference')
      .eq('account_id', accountId);

    const existingHashes = new Set<string>();
    const existingReferences = new Set<string>();
    const existingLooseCounts = new Map<string, number>();

    existingTransactions?.forEach(t => {
      existingHashes.add(generateTransactionHash(t.date, t.merchant_name, t.amount));
      if (t.original_description) {
        existingHashes.add(generateTransactionHash(t.date, t.original_description, t.amount));
      }
      if (t.merchant_display_name) {
        existingHashes.add(generateTransactionHash(t.date, t.merchant_display_name, t.amount));
      }
      if (t.csv_reference) {
        existingReferences.add(t.csv_reference);
      }
      const looseKey = generateLooseHash(t.date, t.amount);
      existingLooseCounts.set(looseKey, (existingLooseCounts.get(looseKey) || 0) + 1);
    });

    // Get categories and merchant mappings
    const { data: categories } = await supabase.from('categories').select('id, name');
    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);

    const { data: mappings } = await supabase.from('merchant_mappings').select('*');
    const merchantMappingMap = new Map(mappings?.map(m => [m.original_name.toLowerCase(), m]) || []);

    // Create import record
    const importId = uuidv4();
    const { error: importError } = await supabase.from('csv_imports').insert({
      id: importId,
      account_id: accountId,
      file_name: file.originalname,
      transaction_count: 0, // Will update after import
    });

    if (importError) {
      console.error('Error creating import record:', importError);
      return res.status(500).json({ message: 'Failed to create import record' });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const csvLooseCounts = new Map<string, number>();

    for (const record of records) {
      try {
        const date = parseDate(record[mapping.date]);
        const description = record[mapping.description] || '';
        const amount = parseAmount(record[mapping.amount]);
        const extendedDetails = mapping.extendedDetails ? record[mapping.extendedDetails] : undefined;

        const reference = mapping.reference ? record[mapping.reference]?.replace(/'/g, '').trim() : undefined;
        const displayName = cleanMerchantName(description);

        // Strategy 1: Exact match on csv_reference
        let isDuplicate = !!reference && existingReferences.has(reference);

        // Strategy 2: Hash-based matching on description variants
        if (!isDuplicate) {
          const descHash = generateTransactionHash(date, description, amount);
          const displayNameHash = generateTransactionHash(date, displayName, amount);
          isDuplicate = existingHashes.has(descHash) || existingHashes.has(displayNameHash);
        }

        // Strategy 3: Fuzzy match — same date + same amount already exists
        if (!isDuplicate) {
          const looseKey = generateLooseHash(date, amount);
          const existingCount = existingLooseCounts.get(looseKey) || 0;
          const csvCount = csvLooseCounts.get(looseKey) || 0;
          if (existingCount > csvCount) {
            isDuplicate = true;
          }
          csvLooseCounts.set(looseKey, csvCount + 1);
        }

        if (isDuplicate && skipDuplicates) {
          skipped++;
          continue;
        }

        const transactionType = detectTransactionType(description, amount);

        // Check for merchant mapping
        const merchantMapping = merchantMappingMap.get(description.toLowerCase());

        // Categorize - only expenses and returns get categories
        // Income, investment, and transfer types don't need categories - the type is sufficient
        let categoryId: string | null = null;
        let needsReview = false;

        if (transactionType === 'expense' || transactionType === 'return') {
          if (merchantMapping?.default_category_id) {
            categoryId = merchantMapping.default_category_id;
          } else {
            const result = categorizeWithPlaid(description, extendedDetails || null, null);
            categoryId = categoryMap.get(result.categoryName) || null;
            needsReview = result.needsReview;
          }
        }

        // Insert transaction with import_id
        const { error: insertError } = await supabase.from('transactions').insert({
          id: uuidv4(),
          account_id: accountId,
          plaid_transaction_id: null,
          csv_reference: reference || null,
          import_id: importId,
          amount,
          date,
          merchant_name: description,
          original_description: extendedDetails || description,
          merchant_display_name: merchantMapping?.display_name || displayName,
          category_id: categoryId,
          transaction_type: transactionType,
          is_split: false,
          is_recurring: false,
          needs_review: needsReview,
          plaid_category: null,
        });

        if (insertError) {
          errors.push(`Row ${imported + skipped + 1}: ${insertError.message}`);
        } else {
          imported++;
          // Track to prevent duplicates within the same import
          existingHashes.add(generateTransactionHash(date, description, amount));
          if (reference) {
            existingReferences.add(reference);
          }
        }
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        errors.push(`Row ${imported + skipped + 1}: ${errorMessage}`);
      }
    }

    // Update import record with final count
    await supabase
      .from('csv_imports')
      .update({ transaction_count: imported })
      .eq('id', importId);

    // If no transactions were imported, delete the import record
    if (imported === 0) {
      await supabase.from('csv_imports').delete().eq('id', importId);
    }

    const response: ImportResponse = {
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 10),
      importId: imported > 0 ? importId : undefined,
    };

    console.log(`CSV import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
    res.json(response);
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ message: 'Failed to import CSV file' });
  }
});

// Get all imports for an account
router.get('/:accountId/imports', async (req, res) => {
  try {
    const { accountId } = req.params;

    const { data, error } = await supabase
      .from('csv_imports')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching imports:', error);
    res.status(500).json({ message: 'Failed to fetch imports' });
  }
});

// Delete an import (and all its transactions)
router.delete('/imports/:importId', async (req, res) => {
  try {
    const { importId } = req.params;

    // Transactions will be cascade deleted due to foreign key
    const { error } = await supabase
      .from('csv_imports')
      .delete()
      .eq('id', importId);

    if (error) throw error;
    
    console.log(`Deleted import ${importId} and all associated transactions`);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting import:', error);
    res.status(500).json({ message: 'Failed to delete import' });
  }
});

// Backfill csv_reference for existing transactions by matching CSV rows
// Matches on date + amount + description/merchant name
router.post('/:accountId/backfill-references', upload.single('file'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Parse CSV
    const csvContent = file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (records.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty' });
    }

    const headers = Object.keys(records[0]);
    const mapping = detectFormat(headers);

    if (!mapping || !mapping.reference) {
      return res.status(400).json({
        message: 'CSV must have a Reference column for backfilling',
        headers,
      });
    }

    // Get existing transactions without csv_reference
    const { data: existingTransactions, error } = await supabase
      .from('transactions')
      .select('id, date, amount, merchant_name, original_description, merchant_display_name')
      .eq('account_id', accountId)
      .is('csv_reference', null);

    if (error) throw error;

    // Build lookup maps for matching: date+amount → list of transactions
    const txByDateAmount = new Map<string, NonNullable<typeof existingTransactions>>();
    for (const t of existingTransactions || []) {
      const key = generateLooseHash(t.date, t.amount);
      if (!txByDateAmount.has(key)) txByDateAmount.set(key, []);
      txByDateAmount.get(key)!.push(t);
    }

    let updated = 0;
    let skipped = 0;
    const alreadyMatched = new Set<string>();

    for (const record of records) {
      try {
        const date = parseDate(record[mapping.date]);
        const description = record[mapping.description] || '';
        const amount = parseAmount(record[mapping.amount]);
        const reference = record[mapping.reference]?.replace(/'/g, '').trim();

        if (!reference) {
          skipped++;
          continue;
        }

        const key = generateLooseHash(date, amount);
        const candidates = txByDateAmount.get(key);
        if (!candidates) {
          skipped++;
          continue;
        }

        // Find best match: try exact description, then cleaned name, then just date+amount
        const descLower = description.toLowerCase().trim();
        const cleanedName = cleanMerchantName(description).toLowerCase().trim();

        const match = candidates.find(t => {
          if (alreadyMatched.has(t.id)) return false;
          const merchantLower = (t.merchant_name || '').toLowerCase().trim();
          const origDescLower = (t.original_description || '').toLowerCase().trim();
          const displayLower = (t.merchant_display_name || '').toLowerCase().trim();
          return merchantLower === descLower
            || origDescLower === descLower
            || displayLower === cleanedName
            || merchantLower === cleanedName;
        }) || candidates.find(t => !alreadyMatched.has(t.id)); // Fallback: first unmatched with same date+amount

        if (match) {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ csv_reference: reference })
            .eq('id', match.id);

          if (!updateError) {
            updated++;
            alreadyMatched.add(match.id);
          }
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    console.log(`Backfill complete: ${updated} updated, ${skipped} skipped`);
    res.json({ success: true, updated, skipped, total: records.length });
  } catch (error) {
    console.error('Error backfilling references:', error);
    res.status(500).json({ message: 'Failed to backfill references' });
  }
});

export default router;
