import { useMemo, useState, type ReactNode } from 'react';
import { getMonthYear } from '../utils/formatters';
import { MonthContext, type MonthYear } from './MonthContext';

interface MonthProviderProps {
  initial?: MonthYear;
  children: ReactNode;
}

/** Holds the selected month for the whole app, so every page opens on the month you were last viewing. */
export const MonthProvider = ({ initial, children }: MonthProviderProps) => {
  const [currentDate, setCurrentDate] = useState<MonthYear>(initial ?? getMonthYear());
  const value = useMemo(() => ({ currentDate, setCurrentDate }), [currentDate]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
};
