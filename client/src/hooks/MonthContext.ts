import { createContext, type Dispatch, type SetStateAction } from 'react';

export interface MonthYear {
  month: number;
  year: number;
}

export interface MonthContextValue {
  currentDate: MonthYear;
  setCurrentDate: Dispatch<SetStateAction<MonthYear>>;
}

export const MonthContext = createContext<MonthContextValue | null>(null);
