import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Select } from '../ui';
import type { Category, Account, Tag, TransactionFilters as Filters } from '../../types';
import { MONTHS } from '../../utils/constants';

interface TransactionFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
}

export const TransactionFilters = ({
  filters,
  onFilterChange,
  categories,
  accounts,
  tags,
}: TransactionFiltersProps) => {
  const currentMonth = filters.month || new Date().getMonth() + 1;
  const currentYear = filters.year || new Date().getFullYear();

  const handlePrevMonth = () => {
    let newMonth = currentMonth - 1;
    let newYear = currentYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    onFilterChange({ ...filters, month: newMonth, year: newYear });
  };

  const handleNextMonth = () => {
    let newMonth = currentMonth + 1;
    let newYear = currentYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    onFilterChange({ ...filters, month: newMonth, year: newYear });
  };

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  const accountOptions = [
    { value: '', label: 'All Accounts' },
    ...accounts.map(a => ({ value: a.id, label: `${a.institution_name} - ${a.account_name}` })),
  ];

  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...tags.map(t => ({ value: t.id, label: t.name })),
  ];

  return (
    <div className="space-y-4">
      {/* Month Selector */}
      <div className="flex items-center justify-between bg-midnight-800 border border-midnight-600 rounded-xl p-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-semibold text-slate-100">
          {MONTHS[currentMonth - 1]} {currentYear}
        </h2>
        <button
          onClick={handleNextMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 rounded-lg transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search transactions..."
              value={filters.search || ''}
              onChange={e => onFilterChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>
        
        <div className="w-48">
          <Select
            value={filters.category_id || ''}
            onChange={e => onFilterChange({ ...filters, category_id: e.target.value })}
            options={categoryOptions}
          />
        </div>
        
        <div className="w-56">
          <Select
            value={filters.account_id || ''}
            onChange={e => onFilterChange({ ...filters, account_id: e.target.value })}
            options={accountOptions}
          />
        </div>
        
        <div className="w-40">
          <Select
            value={filters.tag_id || ''}
            onChange={e => onFilterChange({ ...filters, tag_id: e.target.value })}
            options={tagOptions}
          />
        </div>
      </div>
    </div>
  );
};

