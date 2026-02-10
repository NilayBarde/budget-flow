import { useState, useCallback } from 'react';
import { getMonthYear } from '../utils/formatters';

export interface MonthYear {
  month: number;
  year: number;
}

export const useMonthNavigation = (initial?: MonthYear) => {
  const [currentDate, setCurrentDate] = useState<MonthYear>(initial ?? getMonthYear());

  const handlePrevMonth = useCallback(() => {
    setCurrentDate((prev) => {
      let newMonth = prev.month - 1;
      let newYear = prev.year;
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      return { month: newMonth, year: newYear };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate((prev) => {
      let newMonth = prev.month + 1;
      let newYear = prev.year;
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      return { month: newMonth, year: newYear };
    });
  }, []);

  return { currentDate, setCurrentDate, handlePrevMonth, handleNextMonth };
};
