import { format, parseISO } from 'date-fns';

export const formatCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);
  
  return amount < 0 ? `-${formatted}` : formatted;
};

export const formatDate = (date: string | Date, formatStr = 'MMM d, yyyy'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
};

export const getMonthYear = (date: Date = new Date()): { month: number; year: number } => {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
};

export const formatAccountLabel = (account: { institution_name?: string | null; account_name?: string | null }): string => {
  const institution = account.institution_name?.trim() || '';
  const name = account.account_name?.trim() || '';
  if (!name) return institution;
  if (!institution) return name;
  // Avoid "Chase Chase Sapphire" when the account name already carries the institution
  if (name.toLowerCase().includes(institution.toLowerCase())) return name;
  return `${institution} ${name}`;
};

