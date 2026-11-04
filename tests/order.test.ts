import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { createOrderAndPayment, cancelOrder } from '../src/services/orderService';
import { setOpeningStock } from '../src/services/stockService';
import { seedDemoData } from '../src/db/seed';

describe('Order & Payment Logic with Atomic Stock Deduction', () => {
  beforeEach(async () => {
    await db.orders.clear();
    await db.orderItems.clear();
    await db.payments.clear();
    await db.stockMovements.clear();
    await db.stock.clear();
    await db.products.clear();
    await seedDemoData(true);
  });

  it('completes a cash checkout atomically and deducts stock', async () => {
    // Check initial stock for Iced Latte (40)
    const initialStock = await db.stock.get('prod-iced-latte');
    expect(initialStock?.remainingQty).toBe(40);
    expect(initialStock?.soldQty).toBe(0);

    // Buy 2 Iced Lattes ($3.50 x 2 = $7.00 / 700 cents) with $10 cash (1000 cents)
    const order = await createOrderAndPayment({
      items: [{ productId: 'prod-iced-latte', quantity: 2 }],
      paymentMethod: 'CASH',
      amountReceived: 1000,
    });

    expect(order.orderNumber).toMatch(/^OMR-\d{8}-\d{4}$/);
    expect(order.totalAmount).toBe(700);
    expect(order.status).toBe('COMPLETED');
    expect(order.syncStatus).toBe('PENDING');

    // Verify Payment Record
    expect(order.payment).toBeDefined();
    expect(order.payment?.method).toBe('CASH');
    expect(order.payment?.amountReceived).toBe(1000);
    expect(order.payment?.changeGiven).toBe(300); // $3.00 change

    // Verify Stock Deduction
    const updatedStock = await db.stock.get('prod-iced-latte');
    expect(updatedStock?.soldQty).toBe(2);
    expect(updatedStock?.remainingQty).toBe(38); // 40 - 2

    // Verify Stock Movement
    const movements = await db.stockMovements.where('referenceId').equals(order.id).toArray();
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('SALE');
    expect(movements[0].quantity).toBe(2);
    expect(movements[0].newQty).toBe(38);
  });

  it('blocks unverified QR payments strictly', async () => {
    // 1. Missing reference
    await expect(
      createOrderAndPayment({
        items: [{ productId: 'prod-americano', quantity: 1 }],
        paymentMethod: 'QR',
        qrReference: '',
        qrVerified: true,
      })
    ).rejects.toThrow(/Payment reference code is required/);

    // 2. Unverified by staff
    await expect(
      createOrderAndPayment({
        items: [{ productId: 'prod-americano', quantity: 1 }],
        paymentMethod: 'QR',
        qrReference: 'REF-TX-9988',
        qrVerified: false,
      })
    ).rejects.toThrow(/Staff must verify that the QR transfer has been successfully received/);

    // 3. Valid and verified
    const order = await createOrderAndPayment({
      items: [{ productId: 'prod-americano', quantity: 1 }],
      paymentMethod: 'QR',
      qrReference: 'REF-TX-9988',
      qrVerified: true,
    });

    expect(order.status).toBe('COMPLETED');
    expect(order.payment?.reference).toBe('REF-TX-9988');
  });

  it('rejects checkout when insufficient cash is tendered', async () => {
    // Total is $3.50 (350 cents), tendered $3.00 (300 cents)
    await expect(
      createOrderAndPayment({
        items: [{ productId: 'prod-iced-latte', quantity: 1 }],
        paymentMethod: 'CASH',
        amountReceived: 300,
      })
    ).rejects.toThrow(/Insufficient cash received/);
  });

  it('blocks checkout if an item is out of stock', async () => {
    // Set stock of Sandwich to 0
    await setOpeningStock('prod-sandwich', 0);

    await expect(
      createOrderAndPayment({
        items: [{ productId: 'prod-sandwich', quantity: 1 }],
        paymentMethod: 'CASH',
        amountReceived: 1000,
      })
    ).rejects.toThrow(/Insufficient stock for "Club Sandwich"/);
  });

  it('cancels completed order and reverses stock exactly once', async () => {
    // Buy 3 Burgers
    const order = await createOrderAndPayment({
      items: [{ productId: 'prod-burger', quantity: 3 }],
      paymentMethod: 'CASH',
      amountReceived: 2000,
    });

    const stockAfterSale = await db.stock.get('prod-burger');
    expect(stockAfterSale?.soldQty).toBe(3);
    expect(stockAfterSale?.remainingQty).toBe(17); // 20 - 3

    // Cancel order
    const cancelled = await cancelOrder(order.id, 'Customer cancelled order');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('Customer cancelled order');
    expect(cancelled.syncStatus).toBe('PENDING'); // Queued for sync

    // Verify stock reversed back
    const stockAfterCancel = await db.stock.get('prod-burger');
    expect(stockAfterCancel?.soldQty).toBe(0);
    expect(stockAfterCancel?.remainingQty).toBe(20); // 17 + 3 back to 20

    // Verify cancel return movement
    const movements = await db.stockMovements.where('referenceId').equals(order.id).toArray();
    const returnMovement = movements.find((m) => m.type === 'SALE_CANCELLED_RETURN');
    expect(returnMovement).toBeDefined();
    expect(returnMovement?.quantity).toBe(3);
    expect(returnMovement?.newQty).toBe(20);

    // Duplicate cancellation MUST throw error and not reverse stock twice!
    await expect(cancelOrder(order.id, 'Try again')).rejects.toThrow(
      /is already cancelled/
    );

    // Confirm stock remained 20
    const stockRecheck = await db.stock.get('prod-burger');
    expect(stockRecheck?.remainingQty).toBe(20);
  });
});

