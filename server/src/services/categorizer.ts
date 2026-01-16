const CATEGORY_PATTERNS: Record<string, string[]> = {
  Housing: [
    'rent', 'mortgage', 'landlord', 'property', 'apartment', 'lease',
    'hoa', 'homeowner', 'housing', 'real estate', 'realty', 'zillow',
    'bilt', 'condo', 'tenant', 'rental'
  ],
  Dining: [
    'restaurant', 'cafe', 'coffee', 'starbucks', 'dunkin', 'mcdonald',
    'chipotle', 'subway', 'pizza', 'burger', 'sushi', 'thai', 'chinese',
    'indian', 'mexican', 'doordash', 'ubereats', 'grubhub', 'seamless',
    'postmates', 'caviar', 'bar', 'pub', 'grill', 'kitchen', 'eatery',
    'diner', 'bakery', 'taco', 'wing', 'noodle', 'ramen', 'pho'
  ],
  Groceries: [
    'grocery', 'supermarket', 'whole foods', 'trader joe', 'safeway',
    'kroger', 'walmart', 'target', 'costco', 'aldi', 'publix', 'wegmans',
    'market', 'fresh', 'organic', 'instacart', 'amazon fresh'
  ],
  Transportation: [
    'uber', 'lyft', 'taxi', 'cab', 'parking', 'gas', 'shell', 'chevron',
    'exxon', 'mobil', 'bp', 'citgo', 'metro', 'transit', 'bus',
    'train', 'amtrak', 'airline', 'toll', 'car wash', 'auto'
  ],
  Entertainment: [
    'netflix', 'hulu', 'disney', 'hbo', 'spotify', 'apple music', 'youtube',
    'twitch', 'movie', 'theater', 'cinema', 'concert', 'ticket', 'game',
    'steam', 'playstation', 'xbox', 'nintendo', 'arcade', 'bowling'
  ],
  Shopping: [
    'amazon', 'ebay', 'etsy', 'best buy', 'apple store',
    'nike', 'adidas', 'zara', 'h&m', 'uniqlo', 'nordstrom', 'macy', 'gap',
    'old navy', 'tj maxx', 'marshall', 'ross', 'home depot', 'lowes', 'ikea'
  ],
  Utilities: [
    'electric', 'water', 'internet', 'comcast', 'verizon', 'at&t',
    't-mobile', 'sprint', 'phone', 'utility', 'power', 'energy', 'sewage'
  ],
  Subscriptions: [
    'subscription', 'membership', 'monthly', 'annual', 'recurring', 'premium',
    'plus', 'pro', 'patreon', 'substack', 'medium', 'gym', 'fitness'
  ],
  Travel: [
    'hotel', 'airbnb', 'vrbo', 'expedia', 'booking', 'kayak', 'tripadvisor',
    'united', 'delta', 'american', 'southwest', 'jetblue',
    'spirit', 'frontier', 'rental car', 'hertz', 'enterprise', 'avis'
  ],
  Healthcare: [
    'pharmacy', 'cvs', 'walgreens', 'rite aid', 'doctor', 'hospital', 'clinic',
    'medical', 'dental', 'dentist', 'vision', 'eye', 'health', 'insurance',
    'prescription', 'rx', 'urgent care', 'lab', 'therapy'
  ],
  Income: [
    'payroll', 'direct deposit', 'salary', 'wage', 'bonus', 'refund',
    'reimbursement', 'transfer from', 'deposit'
  ],
};

export const categorizeTransaction = (merchantName: string, originalDescription?: string | null): string => {
  const normalizedName = merchantName.toLowerCase();
  const normalizedDescription = originalDescription?.toLowerCase() || '';
  // Check both merchant name and original description for pattern matches
  const textsToCheck = [normalizedName, normalizedDescription];

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      const lowerPattern = pattern.toLowerCase();
      if (textsToCheck.some(text => text.includes(lowerPattern))) {
        return category;
      }
    }
  }

  return 'Other';
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

