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

export const categorizeTransaction = (merchantName: string): string => {
  const normalizedName = merchantName.toLowerCase();
  
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalizedName.includes(pattern.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'Other';
};

export const cleanMerchantName = (rawName: string): string => {
  // Remove common suffixes and transaction codes
  let cleaned = rawName
    .replace(/\s*#\d+/g, '')
    .replace(/\s*\*\d+/g, '')
    .replace(/\s*-\s*\d+/g, '')
    .replace(/\s+\d{4,}/g, '')
    .replace(/\s*(US|USA|CA|NY|TX|FL|IL)\s*$/i, '')
    .replace(/\s*\d{5}(-\d{4})?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Common merchant name cleanups
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
  };
  
  const lowerCleaned = cleaned.toLowerCase();
  for (const [pattern, replacement] of Object.entries(merchantMappings)) {
    if (lowerCleaned.includes(pattern)) {
      return replacement;
    }
  }
  
  // Title case the result
  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

