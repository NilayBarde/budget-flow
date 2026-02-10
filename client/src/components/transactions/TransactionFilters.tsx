import { useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, AlertCircle, Filter, X, Repeat, CalendarDays } from 'lucide-react';
import { Input, Select, Button } from '../ui';
import type { Category, Account, Tag, TransactionFilters as Filters } from '../../types';
import { MONTHS } from '../../utils/constants';
import clsx from 'clsx';

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
  const [showFilters, setShowFilters] = useState(false);
  
  const currentMonth = filters.month || new Date().getMonth() + 1;
  const currentYear = filters.year || new Date().getFullYear();

  const handlePrevMonth = useCallback(() => {
    let newMonth = currentMonth - 1;
    let newYear = currentYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    onFilterChange({ ...filters, month: newMonth, year: newYear, date: undefined });
  }, [currentMonth, currentYear, filters, onFilterChange]);

  const handleNextMonth = useCallback(() => {
    let newMonth = currentMonth + 1;
    let newYear = currentYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    onFilterChange({ ...filters, month: newMonth, year: newYear, date: undefined });
  }, [currentMonth, currentYear, filters, onFilterChange]);

  const handleClearDate = useCallback(() => {
    onFilterChange({ ...filters, date: undefined });
  }, [filters, onFilterChange]);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      const d = new Date(value + 'T00:00:00');
      onFilterChange({ ...filters, date: value, month: d.getMonth() + 1, year: d.getFullYear() });
    } else {
      onFilterChange({ ...filters, date: undefined });
    }
  }, [filters, onFilterChange]);

  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

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

  // Count active filters
  const activeFilterCount = [
    filters.category_id,
    filters.account_id,
    filters.tag_id,
    filters.needs_review,
    filters.is_recurring,
    filters.date,
  ].filter(Boolean).length;

  // Format date for display
  const dateLabel = filters.date
    ? new Date(filters.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="space-y-3">
      {/* Month Selector */}
      <div className="flex items-center justify-between bg-midnight-800 border border-midnight-600 rounded-xl p-3 md:p-4">
        <button
          onClick={handlePrevMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg md:text-xl font-semibold text-slate-100">
          {MONTHS[currentMonth - 1]} {currentYear}
        </h2>
        <button
          onClick={handleNextMonth}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600 rounded-lg transition-colors touch-target"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Active Date Filter Banner */}
      {dateLabel && (
        <div className="flex items-center justify-between bg-accent-500/10 border border-accent-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-accent-400">
            <CalendarDays className="h-4 w-4" />
            <span className="text-sm font-medium">Showing transactions for {dateLabel}</span>
          </div>
          <button
            onClick={handleClearDate}
            className="p-1 text-accent-400 hover:text-accent-300 hover:bg-accent-500/20 rounded transition-colors"
            aria-label="Clear date filter"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search and Filter Toggle - Mobile */}
      <div className="flex gap-2 md:hidden">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search..."
            value={filters.search || ''}
            onChange={e => onFilterChange({ ...filters, search: e.target.value })}
            className="pl-10 w-full"
          />
        </div>
        <Button
          variant="secondary"
          onClick={toggleFilters}
          className={clsx(
            "relative flex-shrink-0",
            showFilters && "bg-accent-500/20 border-accent-500"
          )}
        >
          <Filter className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Mobile Filters Panel */}
      {showFilters && (
        <div className="md:hidden bg-midnight-800 border border-midnight-600 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-slate-200">Filters</span>
            <button
              onClick={toggleFilters}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            <Select
              value={filters.category_id || ''}
              onChange={e => onFilterChange({ ...filters, category_id: e.target.value })}
              options={categoryOptions}
              className="w-full"
            />
            
            <Select
              value={filters.account_id || ''}
              onChange={e => onFilterChange({ ...filters, account_id: e.target.value })}
              options={accountOptions}
              className="w-full"
            />
            
            <Select
              value={filters.tag_id || ''}
              onChange={e => onFilterChange({ ...filters, tag_id: e.target.value })}
              options={tagOptions}
              className="w-full"
            />
            
            <button
              onClick={() => onFilterChange({ 
                ...filters, 
                needs_review: filters.needs_review ? undefined : true 
              })}
              className={clsx(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors",
                filters.needs_review
                  ? "bg-amber-500/20 border-amber-500 text-amber-400"
                  : "bg-midnight-900 border-midnight-600 text-slate-400"
              )}
            >
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Needs Review</span>
            </button>
            
            <button
              onClick={() => onFilterChange({ 
                ...filters, 
                is_recurring: filters.is_recurring ? undefined : true 
              })}
              className={clsx(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors",
                filters.is_recurring
                  ? "bg-accent-500/20 border-accent-500 text-accent-400"
                  : "bg-midnight-900 border-midnight-600 text-slate-400"
              )}
            >
              <Repeat className="h-4 w-4" />
              <span className="text-sm font-medium">Recurring</span>
            </button>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Date</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
                <input
                  type="date"
                  value={filters.date || ''}
                  onChange={handleDateChange}
                  className="w-full bg-midnight-900 border border-midnight-600 rounded-lg pl-10 pr-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all text-base touch-manipulation [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Filter Bar */}
      <div className="hidden md:flex flex-wrap gap-4">
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
        
        <div className="w-40">
          <Input
            type="date"
            value={filters.date || ''}
            onChange={handleDateChange}
          />
        </div>
        
        {/* Needs Review Toggle */}
        <button
          onClick={() => onFilterChange({ 
            ...filters, 
            needs_review: filters.needs_review ? undefined : true 
          })}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors",
            filters.needs_review
              ? "bg-amber-500/20 border-amber-500 text-amber-400"
              : "bg-midnight-800 border-midnight-600 text-slate-400 hover:text-slate-200 hover:border-midnight-500"
          )}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Needs Review</span>
        </button>
        
        {/* Recurring Toggle */}
        <button
          onClick={() => onFilterChange({ 
            ...filters, 
            is_recurring: filters.is_recurring ? undefined : true 
          })}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors",
            filters.is_recurring
              ? "bg-accent-500/20 border-accent-500 text-accent-400"
              : "bg-midnight-800 border-midnight-600 text-slate-400 hover:text-slate-200 hover:border-midnight-500"
          )}
        >
          <Repeat className="h-4 w-4" />
          <span className="text-sm font-medium">Recurring</span>
        </button>
      </div>
    </div>
  );
};
