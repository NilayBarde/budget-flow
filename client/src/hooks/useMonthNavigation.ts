import { useCallback, useContext } from 'react';
import { MonthContext, type MonthYear } from './MonthContext';

export type { MonthYear };

export const useMonthNavigation = () => {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error('useMonthNavigation must be used inside a MonthProvider');
  }
  const { currentDate, setCurrentDate } = context;

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
  }, [setCurrentDate]);

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
  }, [setCurrentDate]);

  return { currentDate, setCurrentDate, handlePrevMonth, handleNextMonth };
};
