import { Card, CardHeader, Button } from '../components/ui';
import { useCategories } from '../hooks';

export const Settings = () => {
  const { data: categories } = useCategories();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your preferences and data</p>
      </div>

      {/* Categories */}
      <Card>
        <CardHeader 
          title="Categories" 
          subtitle="Default categories for organizing transactions"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(categories || []).map(category => (
            <div 
              key={category.id}
              className="flex items-center gap-2 bg-midnight-900 rounded-lg px-3 py-2"
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="text-sm text-slate-200">{category.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader 
          title="Data Management" 
          subtitle="Export or clear your data"
        />
        <div className="flex gap-4">
          <Button variant="secondary">
            Export All Data
          </Button>
          <Button variant="danger">
            Clear All Data
          </Button>
        </div>
      </Card>

      {/* About */}
      <Card>
        <CardHeader 
          title="About" 
          subtitle="BudgetFlow - Personal Finance Tracker"
        />
        <div className="space-y-2 text-sm text-slate-400">
          <p>Version 1.0.0</p>
          <p>Built with React, TypeScript, and TailwindCSS</p>
          <p>Bank connections powered by Plaid</p>
        </div>
      </Card>
    </div>
  );
};

