import { isGamblingOperator } from './transaction-type.js';

// The categories this app ships with, plus the two this user added (Bars and Coffee). The map below may
// only point at these names, and a test checks it: a name that does not exist gives a row no category at
// all (the map once pointed at "Alcohol", which was never a category here).
export const KNOWN_CATEGORY_NAMES: readonly string[] = [
  'Dining', 'Groceries', 'Transportation', 'Entertainment', 'Shopping', 'Utilities', 'Subscriptions',
  'Travel', 'Healthcare', 'Income', 'Other', 'Housing', 'Investment', 'Bars', 'Coffee',
];

// Bars and Coffee are custom categories. A user without them gets the broader one instead of nothing.
export const CATEGORY_FALLBACKS: Readonly<Record<string, string>> = {
  Bars: 'Dining',
  Coffee: 'Dining',
};

/**
 * The id for a category name. Falls back to the broader category when the named one does not exist for
 * this user, and returns null for no name or an unknown one.
 */
export const resolveCategoryId = (name: string | null | undefined, categoryMap: ReadonlyMap<string, string>): string | null => {
  if (!name) return null;
  const direct = categoryMap.get(name);
  if (direct) return direct;
  const fallback = CATEGORY_FALLBACKS[name];
  return (fallback && categoryMap.get(fallback)) || null;
};

// Plaid personal finance category (detailed) to our categories. Every key is a category Plaid really sends
// (see https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv); a test compares
// the map with that list. Where this user kept overriding Plaid's bucket, the map follows them: beer, wine
// and liquor is Bars (27 of 28 overrides), coffee is Coffee (19 of 26), music and other entertainment are
// Subscriptions (28 of 29), and gyms are Healthcare (9 of 9). Income and transfers are typed before a
// category is chosen, so only spending needs an entry.
export const PLAID_PFC_MAP: Record<string, string> = {
  // Food & Drink
  'FOOD_AND_DRINK_RESTAURANT': 'Dining',
  'FOOD_AND_DRINK_FAST_FOOD': 'Dining',
  'FOOD_AND_DRINK_COFFEE': 'Coffee',
  'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR': 'Bars',
  'FOOD_AND_DRINK_GROCERIES': 'Groceries',
  'FOOD_AND_DRINK_VENDING_MACHINES': 'Dining',
  'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK': 'Dining',

  // Transportation
  'TRANSPORTATION_BIKES_AND_SCOOTERS': 'Transportation',
  'TRANSPORTATION_GAS': 'Transportation',
  'TRANSPORTATION_PARKING': 'Transportation',
  'TRANSPORTATION_PUBLIC_TRANSIT': 'Transportation',
  'TRANSPORTATION_TAXIS_AND_RIDE_SHARES': 'Transportation',
  'TRANSPORTATION_TOLLS': 'Transportation',
  'TRANSPORTATION_OTHER_TRANSPORTATION': 'Transportation',

  // Travel
  'TRAVEL_FLIGHTS': 'Travel',
  'TRAVEL_LODGING': 'Travel',
  'TRAVEL_RENTAL_CARS': 'Travel',
  'TRAVEL_OTHER_TRAVEL': 'Travel',

  // Shopping
  'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS': 'Shopping',
  'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES': 'Shopping',
  'GENERAL_MERCHANDISE_CONVENIENCE_STORES': 'Shopping',
  'GENERAL_MERCHANDISE_DEPARTMENT_STORES': 'Shopping',
  'GENERAL_MERCHANDISE_DISCOUNT_STORES': 'Shopping',
  'GENERAL_MERCHANDISE_ELECTRONICS': 'Shopping',
  'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES': 'Shopping',
  'GENERAL_MERCHANDISE_OFFICE_SUPPLIES': 'Shopping',
  'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES': 'Shopping',
  'GENERAL_MERCHANDISE_PET_SUPPLIES': 'Shopping',
  'GENERAL_MERCHANDISE_SPORTING_GOODS': 'Shopping',
  'GENERAL_MERCHANDISE_SUPERSTORES': 'Shopping',
  'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE': 'Shopping',
  'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE': 'Shopping',

  // Home
  'HOME_IMPROVEMENT_FURNITURE': 'Shopping',
  'HOME_IMPROVEMENT_HARDWARE': 'Shopping',
  'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE': 'Housing',
  'HOME_IMPROVEMENT_SECURITY': 'Housing',
  'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT': 'Shopping',

  // Entertainment
  'ENTERTAINMENT_CASINOS_AND_GAMBLING': 'Entertainment',
  'ENTERTAINMENT_MUSIC_AND_AUDIO': 'Subscriptions',
  'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS': 'Entertainment',
  'ENTERTAINMENT_TV_AND_MOVIES': 'Entertainment',
  'ENTERTAINMENT_VIDEO_GAMES': 'Entertainment',
  'ENTERTAINMENT_OTHER_ENTERTAINMENT': 'Subscriptions',

  // Rent & utilities
  'RENT_AND_UTILITIES_RENT': 'Housing',
  'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY': 'Utilities',
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE': 'Utilities',
  'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT': 'Utilities',
  'RENT_AND_UTILITIES_TELEPHONE': 'Utilities',
  'RENT_AND_UTILITIES_WATER': 'Utilities',
  'RENT_AND_UTILITIES_OTHER_UTILITIES': 'Utilities',

  // Healthcare
  'MEDICAL_DENTAL_CARE': 'Healthcare',
  'MEDICAL_EYE_CARE': 'Healthcare',
  'MEDICAL_NURSING_CARE': 'Healthcare',
  'MEDICAL_PHARMACIES_AND_SUPPLEMENTS': 'Healthcare',
  'MEDICAL_PRIMARY_CARE': 'Healthcare',
  'MEDICAL_VETERINARY_SERVICES': 'Healthcare',
  'MEDICAL_OTHER_MEDICAL': 'Healthcare',

  // Personal care
  'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS': 'Healthcare',
  'PERSONAL_CARE_HAIR_AND_BEAUTY': 'Shopping',
  'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING': 'Shopping',
  'PERSONAL_CARE_OTHER_PERSONAL_CARE': 'Shopping',

  // Services
  'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING': 'Other',
  'GENERAL_SERVICES_AUTOMOTIVE': 'Transportation',
  'GENERAL_SERVICES_CHILDCARE': 'Other',
  'GENERAL_SERVICES_CONSULTING_AND_LEGAL': 'Other',
  'GENERAL_SERVICES_EDUCATION': 'Other',
  'GENERAL_SERVICES_INSURANCE': 'Other',
  'GENERAL_SERVICES_POSTAGE_AND_SHIPPING': 'Other',
  'GENERAL_SERVICES_STORAGE': 'Other',
  'GENERAL_SERVICES_OTHER_GENERAL_SERVICES': 'Other',

  // Government & non-profit
  'GOVERNMENT_AND_NON_PROFIT_DONATIONS': 'Other',
  'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES': 'Other',
  'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT': 'Other',
  'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT': 'Other',

  // Fees and loan payments (the loan payments are normally typed as transfers before this is consulted)
  'BANK_FEES_ATM_FEES': 'Other',
  'BANK_FEES_FOREIGN_TRANSACTION_FEES': 'Other',
  'BANK_FEES_INSUFFICIENT_FUNDS': 'Other',
  'BANK_FEES_INTEREST_CHARGE': 'Other',
  'BANK_FEES_OVERDRAFT_FEES': 'Other',
  'BANK_FEES_OTHER_BANK_FEES': 'Other',
  'LOAN_PAYMENTS_CAR_PAYMENT': 'Other',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT': 'Other',
  'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT': 'Other',
  'LOAN_PAYMENTS_MORTGAGE_PAYMENT': 'Housing',
  'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT': 'Other',
  'LOAN_PAYMENTS_OTHER_PAYMENT': 'Other',
  'LOAN_PAYMENTS_CASH_ADVANCES': 'Other',

  // Income
  'INCOME_DIVIDENDS': 'Income',
  'INCOME_INTEREST_EARNED': 'Income',
  'INCOME_RETIREMENT_PENSION': 'Income',
  'INCOME_TAX_REFUND': 'Income',
  'INCOME_UNEMPLOYMENT': 'Income',
  'INCOME_WAGES': 'Income',
  'INCOME_OTHER_INCOME': 'Income',
};

// Plaid primary category fallback, for a detail Plaid adds later or one the map does not list. Plaid's
// catch all OTHER is left out on purpose: it means Plaid does not know, so the row goes to review.
const PLAID_PRIMARY_MAP: Record<string, string> = {
  'FOOD_AND_DRINK': 'Dining',
  'TRANSPORTATION': 'Transportation',
  'TRAVEL': 'Travel',
  'GENERAL_MERCHANDISE': 'Shopping',
  'HOME_IMPROVEMENT': 'Shopping',
  'ENTERTAINMENT': 'Entertainment',
  'RENT_AND_UTILITIES': 'Utilities',
  'MEDICAL': 'Healthcare',
  'PERSONAL_CARE': 'Shopping',
  'GENERAL_SERVICES': 'Other',
  'GOVERNMENT_AND_NON_PROFIT': 'Other',
  'BANK_FEES': 'Other',
  'LOAN_PAYMENTS': 'Other',
  'INCOME': 'Income',
};

// Plaid Personal Finance Category type
export interface PlaidPFC {
  primary?: string;
  detailed?: string;
}

// Result of categorization with confidence info
export interface CategorizationResult {
  categoryName: string | null;
  needsReview: boolean;
  source: 'plaid' | 'none';
}

/**
 * Categorize using Plaid's Personal Finance Category only
 * If Plaid doesn't provide a category, mark for manual review
 * 
 * Priority:
 * 1. Plaid detailed category (most specific)
 * 2. Plaid primary category (fallback)
 * 3. No category - mark for review
 */
export const categorizeWithPlaid = (
  merchantName: string,
  originalDescription: string | null | undefined,
  plaidPFC: PlaidPFC | null | undefined
): CategorizationResult => {
  // A betting site is typed as spending or a return (see detectTransactionType), so its category
  // has to be spending too, even when Plaid tagged a cashout as income.
  if (isGamblingOperator([merchantName, originalDescription])) {
    return { categoryName: 'Entertainment', needsReview: false, source: 'plaid' };
  }

  // Try Plaid detailed category first (most specific)
  if (plaidPFC?.detailed) {
    const category = PLAID_PFC_MAP[plaidPFC.detailed];
    if (category) {
      return { categoryName: category, needsReview: false, source: 'plaid' };
    }
  }
  
  // Try Plaid primary category
  if (plaidPFC?.primary) {
    const category = PLAID_PRIMARY_MAP[plaidPFC.primary];
    if (category) {
      return { categoryName: category, needsReview: false, source: 'plaid' };
    }
  }
  
  // No Plaid category - leave uncategorized and mark for manual review
  return { categoryName: null, needsReview: true, source: 'none' };
};

export const cleanMerchantName = (rawName: string): string => {
  let cleaned = rawName
    // Remove Wealthfront/Plaid specific patterns
    .replace(/\s*Money\s*(In|Out)\s*Dda_transaction\s*$/i, '')
    .replace(/\s*Dda_transaction\s*$/i, '')
    // Remove random hashes (common in transfer IDs)
    .replace(/-[a-z0-9]{10,}/gi, '')
    // Remove acctverify patterns
    .replace(/-acctverify/gi, ' Verification')
    // Clean up transfer patterns  
    .replace(/-transfer\b/gi, ' Transfer')
    // Remove common suffixes
    .replace(/\s*#\d+/g, '')
    .replace(/\s*\*\d+/g, '')
    .replace(/\s*-\s*\d+/g, '')
    .replace(/\s+\d{4,}/g, '')
    .replace(/\s*(US|USA|CA|NY|TX|FL|IL)\s*$/i, '')
    .replace(/\s*\d{5}(-\d{4})?\s*$/g, '')
    // Clean up abbreviations
    .replace(/\bEnterta-edi\b/gi, 'Entertainment')
    .replace(/\bPymnts?\b/gi, 'Payment')
    .replace(/\bPmt\b/gi, 'Payment')
    .replace(/\bXfer\b/gi, 'Transfer')
    .replace(/\bDep\b/gi, 'Deposit')
    .replace(/\bWdrl\b/gi, 'Withdrawal')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  const merchantMappings: Record<string, string> = {
    'amzn mktp': 'Amazon',
    'amazon.com': 'Amazon',
    'amzn': 'Amazon',
    'wm supercenter': 'Walmart',
    'wal-mart': 'Walmart',
    'tgt': 'Target',
    'starbucks store': 'Starbucks',
    'sbux': 'Starbucks',
    'mcdonalds': "McDonald's",
    'chick-fil-a': 'Chick-fil-A',
    'dd donut': "Dunkin'",
    'dunkin': "Dunkin'",
    'capital one verification': 'Capital One (Verification)',
    'capital one transfer': 'Capital One Transfer',
  };

  const lowerCleaned = cleaned.toLowerCase();
  for (const [pattern, replacement] of Object.entries(merchantMappings)) {
    if (lowerCleaned.includes(pattern)) {
      return replacement;
    }
  }

  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

