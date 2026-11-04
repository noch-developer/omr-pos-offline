import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  CheckCircle2,
  HardDrive,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';
import type { AppSettings } from '../types';
import {
  getSettings,
  updateSettings,
  resetDemoData,
  clearAllTransactionData,
} from '../services/settingsService';
import {
  exportDatabaseBackup,
  validateBackupFileContent,
  restoreDatabaseBackup,
  downloadSampleProductStockTemplate,
  type BackupValidationResult,
} from '../services/backupService';
import {
  downloadExcelTemplate,
  exportStockToExcel,
  exportOrdersToExcel,
  parseExcelProductFile,
  commitExcelProductsImport,
  type ExcelImportValidationResult,
} from '../services/excelService';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

export function SettingsView() {
  const [formData, setFormData] = useState<AppSettings>({
    eventCode: '',
    eventName: '',
    outletCode: '',
    deviceId: '',
    currency: 'USD',
    currencySymbol: '$',
    apiBaseUrl: '',
    mockSyncEnabled: true,
    qrMerchantName: '',
    qrAccountNumber: '',
    lastSyncTimestamp: undefined,
  });

  const [isSavedToast, setIsSavedToast] = useState(false);
  const [storageUsage, setStorageUsage] = useState<string>('Estimating...');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup confirmation modal
  const [backupPreview, setBackupPreview] = useState<BackupValidationResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Excel import modal & handlers
  const [excelPreview, setExcelPreview] = useState<ExcelImportValidationResult | null>(null);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Reset confirmation modals
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Load existing settings
  useEffect(() => {
    async function load() {
      const data = await getSettings();
      setFormData(data);

      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
          const totalMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
          setStorageUsage(`${usedMB} MB / ${totalMB} MB allocated`);
        } catch {
          setStorageUsage('IndexedDB active');
        }
      } else {
        setStorageUsage('IndexedDB active');
      }
    }
    load();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(formData);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const handleExportBackup = async () => {
    try {
      const fileName = await exportDatabaseBackup();
      alert(`Database backup exported successfully: ${fileName}`);
    } catch (err) {
      alert('Backup failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const validation = validateBackupFileContent(content);
      setBackupPreview(validation);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleConfirmRestore = async () => {
    if (!backupPreview?.data) return;
    setIsRestoring(true);

    try {
      await restoreDatabaseBackup(backupPreview.data, backupPreview.mode);
      setBackupPreview(null);
      alert('Import completed successfully! The page will now reload.');
      window.location.reload();
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await parseExcelProductFile(file);
    setExcelPreview(result);
    e.target.value = ''; // Reset file input
  };

  const handleConfirmExcelImport = async () => {
    if (!excelPreview?.products) return;
    setIsExcelImporting(true);

    try {
      await commitExcelProductsImport(excelPreview.products);
      setExcelPreview(null);
      alert(`Successfully imported ${excelPreview.products.length} products and opening stock from Excel! The page will now reload.`);
      window.location.reload();
    } catch (err) {
      alert('Excel import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsExcelImporting(false);
    }
  };

  const handleExportStockExcel = async () => {
    try {
      const fileName = await exportStockToExcel();
      alert(`Inventory report exported to Excel: ${fileName}`);
    } catch (err) {
      alert('Failed to export inventory: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleExportOrdersExcel = async () => {
    try {
      const fileName = await exportOrdersToExcel();
      alert(`Sales report exported to Excel: ${fileName}`);
    } catch (err) {
      alert('Failed to export sales report: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleConfirmResetDemo = async () => {
    await resetDemoData();
    setIsResetConfirmOpen(false);
    alert('Products and initial stock have been reset to demo data.');
    window.location.reload();
  };

  const handleConfirmClearTransactions = async () => {
    await clearAllTransactionData();
    setIsClearConfirmOpen(false);
    alert('All orders, payments, and sales have been cleared.');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 select-none">
      {/* Toast */}
      {isSavedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Settings saved successfully</span>
        </div>
      )}

      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-black text-slate-900 tracking-tight">System Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure event identity, POS synchronization, backup & restore, and local storage
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-4xl space-y-6">
        {/* Form: Event Identity & POS Config */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Event & Hardware Configuration</h3>
              <p className="text-xs text-slate-400">Settings tagged with all outgoing sync payloads</p>
            </div>
            <Button type="submit" variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="w-4 h-4 mr-1.5" />
              Save Configuration
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Event Code"
              value={formData.eventCode}
              onChange={(e) => setFormData({ ...formData, eventCode: e.target.value })}
              placeholder="e.g. EVT-2026-OMR01"
              required
            />
            <Input
              label="Event Name"
              value={formData.eventName}
              onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
              placeholder="e.g. OMR Weekend Pop-Up Market"
              required
            />
            <Input
              label="Outlet Code"
              value={formData.outletCode}
              onChange={(e) => setFormData({ ...formData, outletCode: e.target.value })}
              placeholder="e.g. OMR-MAIN"
              required
            />
            <Input
              label="Device / Tablet ID"
              value={formData.deviceId}
              onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
              placeholder="e.g. TAB-POS-01"
              required
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Currency Code"
                value={formData.currency}
                disabled
                helperText="Fixed to USD ($) for this deployment"
              />
              <Input
                label="API Base URL (Restaurant POS)"
                value={formData.apiBaseUrl}
                onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                placeholder="https://pos-api.onemorerestaurant.com"
                helperText="Endpoint called for POST /api/event-pos/sync"
              />
            </div>
          </div>

          {/* Development Mock Mode Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.mockSyncEnabled}
                onChange={(e) => setFormData({ ...formData, mockSyncEnabled: e.target.checked })}
                className="mt-1 h-5 w-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Enable Development Mock Sync Mode
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Use built-in mock synchronization adapter while backend endpoint is under development.
                  When active, sync actions are explicitly marked as MOCK_SYNCED and never falsely reported as real POS imports.
                </p>
              </div>
            </label>
          </div>

          {/* QR Merchant Info */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
              QR Payment Display Settings
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Merchant Name"
                value={formData.qrMerchantName}
                onChange={(e) => setFormData({ ...formData, qrMerchantName: e.target.value })}
                placeholder="ONE MORE RESTAURANT EVENT"
              />
              <Input
                label="Bank Account / QR ID"
                value={formData.qrAccountNumber}
                onChange={(e) => setFormData({ ...formData, qrAccountNumber: e.target.value })}
                placeholder="099 888 777"
              />
            </div>
          </div>
        </form>

        {/* Excel & Spreadsheet Management */}
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">Excel & Spreadsheet Operations</h3>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  .xlsx / .csv
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Import menu & stock from an Excel file, or export detailed Excel sales & inventory workbooks
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={downloadExcelTemplate}
              className="flex items-center justify-center gap-2 py-3 px-3 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs"
            >
              <Download className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Download Excel Template</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => excelFileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 px-3 text-slate-800 border-slate-300 hover:bg-slate-50 text-xs"
            >
              <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Import from Excel (.xlsx)</span>
            </Button>
            <input
              ref={excelFileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelFileSelect}
              className="hidden"
            />

            <Button
              type="button"
              variant="outline"
              onClick={handleExportStockExcel}
              className="flex items-center justify-center gap-2 py-3 px-3 text-slate-800 border-slate-300 hover:bg-slate-50 text-xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Export Stock to Excel</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleExportOrdersExcel}
              className="flex items-center justify-center gap-2 py-3 px-3 text-slate-800 border-slate-300 hover:bg-slate-50 text-xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Export Orders & Sales</span>
            </Button>
          </div>
        </div>

        {/* Database Backup & Restore */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">JSON Backup & Restore</h3>
            <p className="text-xs text-slate-400">
              Download complete local database or restore from a previous JSON backup
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handleExportBackup}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export Full JSON Backup</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 text-slate-700"
            >
              <Upload className="w-4 h-4 text-sky-600" />
              <span>Import Products / Backup</span>
            </Button>

            <Button
              variant="outline"
              onClick={downloadSampleProductStockTemplate}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 text-emerald-800 border-emerald-300 hover:bg-emerald-50"
            >
              <FileCode className="w-4 h-4 text-emerald-600" />
              <span>Download Sample JSON</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <span>IndexedDB Storage Status: <strong>{storageUsage}</strong></span>
          </div>
        </div>

        {/* Development & Reset Data */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm text-rose-800">
              Development Maintenance & Reset
            </h3>
            <p className="text-xs text-slate-400">
              Actions for testing during development. Use with caution.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setIsResetConfirmOpen(true)}
              className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Demo Products & Stock</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsClearConfirmOpen(true)}
              className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50 flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Orders & Sales (Reset Sales Ledger)</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Backup Preview & Restore Modal */}
      <Modal
        isOpen={backupPreview !== null}
        onClose={() => setBackupPreview(null)}
        title="Restore Database Backup"
        description="Verify backup details before restoring"
      >
        {backupPreview && (
          <div className="space-y-4 text-xs">
            {backupPreview.valid && backupPreview.summary ? (
              <>
                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl space-y-1.5 text-sky-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">File Validation Passed</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-200 text-sky-900">
                      {backupPreview.mode === 'PRODUCTS_AND_STOCK' ? 'Product Catalog' : 'Full Backup'}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-800 font-medium">{backupPreview.summary.description}</p>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-sky-200/60 text-xs">
                    <div>Products to Import: <strong>{backupPreview.summary.productsCount}</strong></div>
                    <div>Stock Records: <strong>{backupPreview.summary.stockCount}</strong></div>
                    {backupPreview.mode === 'FULL_BACKUP' && (
                      <>
                        <div>Orders: <strong>{backupPreview.summary.ordersCount}</strong></div>
                        <div>Payments: <strong>{backupPreview.summary.paymentsCount}</strong></div>
                      </>
                    )}
                  </div>
                </div>

                <div className={`p-3 rounded-xl text-xs ${
                  backupPreview.mode === 'PRODUCTS_AND_STOCK'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border border-amber-200 text-amber-900'
                }`}>
                  {backupPreview.mode === 'PRODUCTS_AND_STOCK' ? (
                    <span><strong>Notice:</strong> This will import/update your product catalog and opening stock. Your order history and sales ledger will be preserved.</span>
                  ) : (
                    <span><strong>Warning:</strong> Restoring this full backup will overwrite all database tables with the backup contents.</span>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setBackupPreview(null)} disabled={isRestoring}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleConfirmRestore}
                    isLoading={isRestoring}
                  >
                    Confirm Restore
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                  <p className="font-bold">Validation Error</p>
                  <p className="mt-1">{backupPreview.error}</p>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => setBackupPreview(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Excel Import Preview Modal */}
      <Modal
        isOpen={excelPreview !== null}
        onClose={() => setExcelPreview(null)}
        title="Import Products & Opening Stock from Excel"
        description="Verify parsed spreadsheet records before saving to IndexedDB"
        size="lg"
      >
        {excelPreview && (
          <div className="space-y-4 text-xs">
            {excelPreview.valid && excelPreview.summary ? (
              <>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-emerald-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">Spreadsheet Parsed Successfully!</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900">
                      {excelPreview.products?.length} Products Found
                    </span>
                  </div>
                  <div className="text-xs">
                    Categories detected: <strong>{excelPreview.summary.categories.join(', ')}</strong>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Sample Products Preview</h4>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {excelPreview.products?.slice(0, 10).map((p, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-800">{p.name}</span>
                          <span className="ml-2 text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-semibold">
                            {p.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 font-mono">
                          <span className="text-emerald-700 font-bold">${(p.price / 100).toFixed(2)}</span>
                          <span className="text-slate-600">Opening Stock: <strong>{p.openingStock}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {excelPreview.products && excelPreview.products.length > 10 && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">
                      + {excelPreview.products.length - 10} more items will be imported
                    </p>
                  )}
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <strong>Notice:</strong> This will import the {excelPreview.products?.length} products and set their opening stock in IndexedDB. Existing completed orders will not be deleted.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setExcelPreview(null)} disabled={isExcelImporting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleConfirmExcelImport}
                    isLoading={isExcelImporting}
                  >
                    Confirm & Load Menu
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                  <p className="font-bold">Excel Read Error</p>
                  <p className="mt-1">{excelPreview.error}</p>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => setExcelPreview(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reset Demo Data Modal */}
      <Modal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        title="Reset Demo Products & Stock?"
        description="This will restore the 8 default menu items and their opening stock."
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Products like Iced Latte, Americano, Green Tea, Sandwich, Burger, and Bottled Water will be refreshed. Existing orders will not be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsResetConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="bg-amber-600 hover:bg-amber-700" onClick={handleConfirmResetDemo}>
              Yes, Reset Demo Data
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear Transactions Modal */}
      <Modal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        title="Clear All Orders & Sales?"
        description="Warning: All recorded orders, payments, and sales sync items will be erased."
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            This will reset Sold Qty and Waste Qty on stock back to 0, and clear the order history. Only use this for test data clearing!
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsClearConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmClearTransactions}>
              Yes, Clear All Sales Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
