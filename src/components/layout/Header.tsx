import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShoppingBag,
  Package,
  Clock,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
  Store,
  Download,
  Share,
  PlusSquare,
  Tablet,
} from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export function Header() {
  const { isOnline } = useNetworkStatus();
  const { isInstallable, isInstalled, canPromptDirectly, promptInstall } = usePwaInstall();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isIosModalOpen, setIsIosModalOpen] = useState(false);

  // Live count of pending sync orders
  const pendingOrdersCount = useLiveQuery(
    () => db.orders.where('syncStatus').anyOf(['PENDING', 'FAILED']).count(),
    [],
    0
  );

  const eventSettings = useLiveQuery(
    async () => {
      const code = await db.settings.get('eventCode');
      const name = await db.settings.get('eventName');
      return {
        code: (code?.value as string) || 'OMR-EVENT',
        name: (name?.value as string) || 'Event POS',
      };
    },
    [],
    { code: 'OMR-EVENT', name: 'Event POS' }
  );

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallClick = async () => {
    if (canPromptDirectly) {
      await promptInstall();
    } else {
      setIsIosModalOpen(true);
    }
  };

  const navItems = [
    { to: '/', label: 'POS Register', icon: ShoppingBag },
    { to: '/stock', label: 'Stock Control', icon: Package },
    { to: '/orders', label: 'Orders', icon: Clock },
    { to: '/sync', label: 'Sync', icon: RefreshCw, badge: pendingOrdersCount },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 select-none z-30 shadow-xs">
        {/* Brand & Event Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-xl shadow-sm">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900">
                ONE MORE RESTAURANT
              </span>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                EVENT POS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate max-w-[220px]">
              {eventSettings.name} ({eventSettings.code})
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Landscape tablet friendly) */}
        <nav className="flex items-center gap-1 sm:gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Status Indicators, PWA Install & Clock */}
        <div className="flex items-center gap-2.5">
          {/* PWA Install Button (Shown on tablets when not yet installed) */}
          {!isInstalled && isInstallable && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95 animate-pulse"
              title="Install OMR Event POS as standalone tablet app"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Install Tablet App</span>
            </button>
          )}

          {/* Standalone Installed Badge */}
          {isInstalled && (
            <div
              className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200"
              title="Running in Standalone Tablet App Mode"
            >
              <Tablet className="w-3 h-3 text-emerald-600" />
              <span>Tablet App</span>
            </div>
          )}

          {/* Offline / Online Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-300'
            }`}
            title={isOnline ? 'Online (Internet reachable)' : 'Offline (Local IndexedDB active)'}
          >
            {isOnline ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-bold">Offline</span>
              </>
            )}
          </div>

          {/* Real-time Clock */}
          <div className="hidden lg:flex items-center gap-1.5 font-mono text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* iPad / iOS Safari Installation Helper Modal */}
      <Modal
        isOpen={isIosModalOpen}
        onClose={() => setIsIosModalOpen(false)}
        title="Install OMR Event POS on iPad"
        description="Follow these 2 steps to install as a full-screen tablet app"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-950">
            <Tablet className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Standalone Full-Screen Mode</p>
              <p className="mt-0.5 text-emerald-800">
                Installing as a PWA hides Safari address bars and prevents accidental tab closures during busy event operations.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div>
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  Tap the Safari Share button
                  <Share className="w-4 h-4 text-sky-600 inline" />
                </p>
                <p className="text-slate-500 mt-0.5">
                  Located in the top toolbar or bottom bar of Safari on your iPad.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div>
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  Select "Add to Home Screen"
                  <PlusSquare className="w-4 h-4 text-emerald-600 inline" />
                </p>
                <p className="text-slate-500 mt-0.5">
                  Scroll down the share options and tap <strong>"Add to Home Screen"</strong>, then tap <strong>"Add"</strong> in the top right corner.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setIsIosModalOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
