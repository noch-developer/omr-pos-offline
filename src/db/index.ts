import Dexie, { type Table } from 'dexie';
import type {
  Product,
  StockRecord,
  StockMovement,
  Order,
  OrderItem,
  PaymentRecord,
  SyncQueueItem,
} from '../types';

export interface SettingItem {
  key: string;
  value: unknown;
}

export class OmrDatabase extends Dexie {
  products!: Table<Product, string>;
  stock!: Table<StockRecord, string>;
  orders!: Table<Order, string>;
  orderItems!: Table<OrderItem, string>;
  payments!: Table<PaymentRecord, string>;
  stockMovements!: Table<StockMovement, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  settings!: Table<SettingItem, string>;

  constructor(dbName = 'OmrEventPosDB') {
    super(dbName);

    this.version(1).stores({
      products: 'id, name, category, price, isActive, sortOrder',
      stock: 'productId, updatedAt',
      orders: 'id, orderNumber, createdAt, status, syncStatus, paymentMethod, eventId',
      orderItems: 'id, orderId, productId',
      payments: 'id, orderId, method, status, paidAt',
      stockMovements: 'id, productId, type, createdAt, referenceId',
      syncQueue: 'id, entityType, entityId, status, createdAt',
      settings: 'key',
    });
  }
}

export const db = new OmrDatabase();

