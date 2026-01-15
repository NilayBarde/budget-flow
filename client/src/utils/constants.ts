export const DEFAULT_CATEGORIES = [
  { name: 'Housing', icon: 'home', color: '#0ea5e9' },
  { name: 'Dining', icon: 'utensils', color: '#f97316' },
  { name: 'Groceries', icon: 'shopping-cart', color: '#22c55e' },
  { name: 'Transportation', icon: 'car', color: '#3b82f6' },
  { name: 'Entertainment', icon: 'film', color: '#a855f7' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Utilities', icon: 'zap', color: '#eab308' },
  { name: 'Subscriptions', icon: 'repeat', color: '#6366f1' },
  { name: 'Travel', icon: 'plane', color: '#14b8a6' },
  { name: 'Healthcare', icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Income', icon: 'wallet', color: '#10b981' },
  { name: 'Other', icon: 'more-horizontal', color: '#64748b' },
] as const;

export const CATEGORY_PATTERNS: Record<string, string[]> = {
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
    'market', 'food', 'fresh', 'organic', 'instacart', 'amazon fresh'
  ],
  Transportation: [
    'uber', 'lyft', 'taxi', 'cab', 'parking', 'gas', 'shell', 'chevron',
    'exxon', 'mobil', 'bp', 'citgo', 'metro', 'transit', 'subway', 'bus',
    'train', 'amtrak', 'airline', 'toll', 'car wash', 'auto'
  ],
  Entertainment: [
    'netflix', 'hulu', 'disney', 'hbo', 'spotify', 'apple music', 'youtube',
    'twitch', 'movie', 'theater', 'cinema', 'concert', 'ticket', 'game',
    'steam', 'playstation', 'xbox', 'nintendo', 'arcade', 'bowling'
  ],
  Shopping: [
    'amazon', 'ebay', 'etsy', 'walmart', 'target', 'best buy', 'apple store',
    'nike', 'adidas', 'zara', 'h&m', 'uniqlo', 'nordstrom', 'macy', 'gap',
    'old navy', 'tj maxx', 'marshall', 'ross', 'home depot', 'lowes', 'ikea'
  ],
  Utilities: [
    'electric', 'gas', 'water', 'internet', 'comcast', 'verizon', 'at&t',
    't-mobile', 'sprint', 'phone', 'utility', 'power', 'energy', 'sewage'
  ],
  Subscriptions: [
    'subscription', 'membership', 'monthly', 'annual', 'recurring', 'premium',
    'plus', 'pro', 'patreon', 'substack', 'medium', 'gym', 'fitness'
  ],
  Travel: [
    'hotel', 'airbnb', 'vrbo', 'expedia', 'booking', 'kayak', 'tripadvisor',
    'airline', 'united', 'delta', 'american', 'southwest', 'jetblue',
    'spirit', 'frontier', 'rental car', 'hertz', 'enterprise', 'avis'
  ],
  Healthcare: [
    'pharmacy', 'cvs', 'walgreens', 'rite aid', 'doctor', 'hospital', 'clinic',
    'medical', 'dental', 'dentist', 'vision', 'eye', 'health', 'insurance',
    'prescription', 'rx', 'urgent care', 'lab', 'therapy'
  ],
  Income: [
    'payroll', 'direct deposit', 'salary', 'wage', 'bonus', 'refund',
    'reimbursement', 'venmo', 'zelle', 'transfer from', 'deposit'
  ],
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const LINK_TOKEN_STORAGE_KEY = 'plaid_link_token';

