import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { PosView } from './views/PosView';
import { StockView } from './views/StockView';
import { OrdersView } from './views/OrdersView';
import { SyncView } from './views/SyncView';
import { SettingsView } from './views/SettingsView';
import { seedDemoData } from './db/seed';
import { AlertCircle, Download, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { exportDatabaseBackup } from './services/backupService';

export function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [dismissWarning, setDismissWarning] = useState(false);

  // Monitor unsynced orders count
  const pendingOrdersCount = useLiveQuery(
    () => db.orders.where('syncStatus').anyOf(['PENDING', 'FAILED']).count(),
    [],
    0
  );

  useEffect(() => {
    async function init() {
      try {
        await seedDemoData(false);
      } catch (err) {
        console.error('Failed to initialize demo data:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    init();
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white select-none">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-base font-bold tracking-tight">OMR Event POS</h2>
        <p className="text-xs text-slate-400 mt-1">Starting local IndexedDB storage...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100 select-none">
        {/* Top Header */}
        <Header />

        {/* Storage / Backup Warning Banner (shown when >= 5 unsynced orders exist to remind staff to back up) */}
        {!dismissWarning && pendingOrdersCount >= 5 && (
          <div className="bg-amber-500 text-slate-950 px-4 py-1.5 flex items-center justify-between text-xs font-semibold shrink-0 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-950 shrink-0" />
              <span>
                <strong>Reminder:</strong> You have {pendingOrdersCount} unsynced offline transactions stored locally. Consider exporting a backup before ending the event.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportDatabaseBackup()}
                className="px-2.5 py-0.5 rounded bg-slate-950 text-white text-[11px] font-bold hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Export Backup</span>
              </button>
              <button
                onClick={() => setDismissWarning(true)}
                className="p-1 hover:bg-amber-600 rounded text-slate-950 transition-colors"
                title="Dismiss warning"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Tablet View Area */}
        <main className="flex-1 flex overflow-hidden">
          <Routes>
            <Route path="/" element={<PosView />} />
            <Route path="/stock" element={<StockView />} />
            <Route path="/orders" element={<OrdersView />} />
            <Route path="/sync" element={<SyncView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

