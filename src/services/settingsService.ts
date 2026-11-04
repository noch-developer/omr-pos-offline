import { db } from '../db';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS, seedDemoData } from '../db/seed';

export async function getSettings(): Promise<AppSettings> {
  const items = await db.settings.toArray();
  const settings: Partial<AppSettings> = {};

  for (const item of items) {
    // @ts-expect-error dynamic assign
    settings[item.key] = item.value;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  await db.settings.put({ key, value });
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await db.settings.put({ key, value });
      }
    }
  });
}

export async function resetDemoData(): Promise<void> {
  await seedDemoData(true);
}

export async function clearAllTransactionData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.payments, db.stockMovements, db.syncQueue, db.stock],
    async () => {
      await db.orders.clear();
      await db.orderItems.clear();
      await db.payments.clear();
      await db.syncQueue.clear();

      // Reset stock sold and waste to 0, leaving opening and stockIn intact
      const stocks = await db.stock.toArray();
      const now = new Date().toISOString();
      for (const s of stocks) {
        s.soldQty = 0;
        s.wasteQty = 0;
        s.remainingQty = s.openingQty + s.stockIn;
        s.updatedAt = now;
        await db.stock.put(s);
      }

      // Clear stock movements except initial OPENING
      await db.stockMovements.where('type').notEqual('OPENING').delete();
    }
  );
}

