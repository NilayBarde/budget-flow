// Plaid Personal Finance Category (PFC) mapping to our categories
// See: https://plaid.com/docs/api/products/transactions/#transactionspersonal_finance_category
const PLAID_PFC_MAP: Record<string, string> = {
  // Food & Drink
  'FOOD_AND_DRINK_RESTAURANTS': 'Dining',
  'FOOD_AND_DRINK_FAST_FOOD': 'Dining',
  'FOOD_AND_DRINK_COFFEE': 'Dining',
  'FOOD_AND_DRINK_BAR': 'Alcohol',
  'FOOD_AND_DRINK_GROCERIES': 'Groceries',
  'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK': 'Dining',
  
  // Transportation
  'TRANSPORTATION_TAXIS_AND_RIDESHARES': 'Transportation',
  'TRANSPORTATION_PUBLIC_TRANSIT': 'Transportation',
  'TRANSPORTATION_GAS': 'Transportation',
  'TRANSPORTATION_PARKING': 'Transportation',
  'TRANSPORTATION_TOLLS': 'Transportation',
  'TRANSPORTATION_CAR_SERVICE': 'Transportation',
  'TRANSPORTATION_OTHER_TRANSPORTATION': 'Transportation',
  'TRANSPORTATION_AIRLINES_AND_AVIATION_SERVICES': 'Travel',
  
  // Travel
  'TRAVEL_FLIGHTS': 'Travel',
  'TRAVEL_LODGING': 'Travel',
  'TRAVEL_RENTAL_CARS': 'Travel',
  'TRAVEL_OTHER_TRAVEL': 'Travel',
  
  // Shopping
  'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES': 'Shopping',
  'GENERAL_MERCHANDISE_SUPERSTORES': 'Shopping',
  'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES': 'Shopping',
  'GENERAL_MERCHANDISE_ELECTRONICS': 'Shopping',
  'GENERAL_MERCHANDISE_SPORTING_GOODS': 'Shopping',
  'GENERAL_MERCHANDISE_HOME_IMPROVEMENT': 'Shopping',
  'GENERAL_MERCHANDISE_GIFT_AND_NOVELTY': 'Shopping',
  'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS': 'Shopping',
  'GENERAL_MERCHANDISE_DEPARTMENT_STORES': 'Shopping',
  'GENERAL_MERCHANDISE_DISCOUNT_STORES': 'Shopping',
  'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE': 'Shopping',
  
  // Entertainment
  'ENTERTAINMENT_TV_AND_MOVIES': 'Entertainment',
  'ENTERTAINMENT_MUSIC_AND_AUDIO': 'Entertainment',
  'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS': 'Entertainment',
  'ENTERTAINMENT_CASINOS_AND_GAMBLING': 'Entertainment',
  'ENTERTAINMENT_VIDEO_GAMES': 'Entertainment',
  'ENTERTAINMENT_OTHER_ENTERTAINMENT': 'Entertainment',
  
  // Subscriptions & Bills
  'RENT_AND_UTILITIES_RENT': 'Housing',
  'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY': 'Utilities',
  'RENT_AND_UTILITIES_WATER': 'Utilities',
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE': 'Utilities',
  'RENT_AND_UTILITIES_TELEPHONE': 'Utilities',
  'RENT_AND_UTILITIES_OTHER_UTILITIES': 'Utilities',
  
  // Healthcare
  'MEDICAL_PHARMACIES_AND_SUPPLEMENTS': 'Healthcare',
  'MEDICAL_DOCTOR': 'Healthcare',
  'MEDICAL_DENTISTS_AND_ORTHODONTISTS': 'Healthcare',
  'MEDICAL_EYECARE': 'Healthcare',
  'MEDICAL_HOSPITALS_AND_CLINICS': 'Healthcare',
  'MEDICAL_MENTAL_HEALTH': 'Healthcare',
  'MEDICAL_OTHER_MEDICAL': 'Healthcare',
  
  // Personal Care
  'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS': 'Subscriptions',
  'PERSONAL_CARE_HAIR_AND_BEAUTY': 'Shopping',
  'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING': 'Shopping',
  'PERSONAL_CARE_OTHER_PERSONAL_CARE': 'Shopping',
  
  // Income
  'INCOME_WAGES': 'Income',
  'INCOME_DIVIDENDS': 'Income',
  'INCOME_INTEREST_EARNED': 'Income',
  'INCOME_RETIREMENT_PENSION': 'Income',
  'INCOME_TAX_REFUND': 'Income',
  'INCOME_UNEMPLOYMENT': 'Income',
  'INCOME_OTHER_INCOME': 'Income',
  
  // Government & Non-profit
  'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT': 'Other',
  'GOVERNMENT_AND_NON_PROFIT_DONATIONS': 'Other',
  'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES': 'Other',
  
  // Loan Payments (transfers - no category)
  'LOAN_PAYMENTS_CAR_PAYMENT': 'Other',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT': 'Other',
  'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT': 'Other',
  'LOAN_PAYMENTS_MORTGAGE_PAYMENT': 'Housing',
  'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT': 'Other',
  'LOAN_PAYMENTS_OTHER_PAYMENT': 'Other',
};

// Plaid primary category fallback (when detailed isn't specific enough)
const PLAID_PRIMARY_MAP: Record<string, string> = {
  'FOOD_AND_DRINK': 'Dining',
  'TRANSPORTATION': 'Transportation',
  'TRAVEL': 'Travel',
  'GENERAL_MERCHANDISE': 'Shopping',
  'ENTERTAINMENT': 'Entertainment',
  'RENT_AND_UTILITIES': 'Utilities',
  'MEDICAL': 'Healthcare',
  'PERSONAL_CARE': 'Shopping',
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
  _merchantName: string,
  _originalDescription: string | null | undefined,
  plaidPFC: PlaidPFC | null | undefined
): CategorizationResult => {
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

