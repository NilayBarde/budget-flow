import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';

export const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-midnight-950">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-midnight-900 border-b border-midnight-700 flex items-center justify-between px-4 z-40 md:hidden">
        <button
          onClick={handleOpenSidebar}
          className="p-2 -ml-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-800 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-display font-bold text-slate-100">BudgetFlow</h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />
      
      {/* Main content - full width on mobile, offset on desktop */}
      <main className="min-h-screen pt-14 pb-20 md:pt-0 md:pb-0 md:ml-64">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
