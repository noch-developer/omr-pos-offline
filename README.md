# OMR Event POS — Offline Tablet Web App

> **ONE MORE RESTAURANT** — Event Pop-Up POS Web Application  
> Production-conscious, small, fast, offline-first tablet POS designed for outside events where there is no permanent connection to the Restaurant POS.

---

## 🌟 Key Features

- **Tablet Landscape First:** Clean, responsive, green-and-white branded UI with large touch targets, left product catalog grid, and right shopping cart.
- **Offline-First & Local Persistence:** 100% functional without internet connection. All transactions, payments, stock movements, and settings are stored locally in **IndexedDB (Dexie.js)**.
- **Atomic Database Transactions:** Order completion, payment creation, and stock deductions are committed atomically via Dexie transactions.
- **Stock Control & Ledger:**
  - Formula: `Remaining = Opening + Stock In - Sold - Waste`
  - Real-time stock checks to prevent negative inventory.
  - Set opening stock, add restock, record waste with mandatory reason.
  - Physical closing stock count reconciliation for end-of-event auditing.
  - Immutable stock movement ledger for every inventory change.
- **Payment Handling:**
  - **Cash:** Automatic change calculation, quick tender presets ($5, $10, $20, $50, Exact, Next Multiple).
  - **QR Payment:** Universal QR layout with merchant details, payment reference input, and **mandatory staff verification check** (unverified QR transfers are strictly prevented from completing).
- **Order Management & Cancellation:**
  - Sequential human-readable order numbers (`OMR-YYYYMMDD-XXXX`).
  - Search and filter by status and sync state.
  - **Exact-Once Stock Reversal:** Cancelling a completed order restores sold quantities back to inventory and logs `SALE_CANCELLED_RETURN` movements.
  - Duplicate cancellation prevention.
  - Reprint thermal receipt (with 80mm printable layout).
- **Synchronization Adapter (`POST /api/event-pos/sync`):**
  - Configurable Restaurant POS API URL.
  - Generates complete payloads with UUID identifiers and idempotency keys.
  - **Development Mock Mode:** Explicitly marks simulated syncs as `MOCK_SYNCED` with an amber warning banner. Never shows mock synchronization as a real successful POS import.
  - Retains failed transactions in the queue for retry on network outages.
- **Excel & Spreadsheet Support (.xlsx / .csv):**
  - **Import from Excel:** Load your menu items and opening stock directly from an Excel spreadsheet.
  - **Download Excel Template:** One-click download of a pre-formatted Excel template.
  - **Export Stock to Excel:** Download a live inventory report with remaining units and inventory value.
  - **Export Sales to Excel:** Multi-sheet workbook with Orders, itemized Items Sold, and the Stock Ledger.
- **Backup & Disaster Recovery:**
  - Single-click **Export Full JSON Backup**.
  - **Import & Restore Backup** with JSON schema validation, record count preview, and confirmation dialog.
- **Installable PWA:** Workbox offline asset precaching, installable as a standalone tablet web app.

---

## 🛠 Technology Stack

- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS (custom emerald/green branding)
- **Icons:** Lucide React
- **Local Database:** Dexie.js (IndexedDB) + `dexie-react-hooks`
- **Cart State Management:** Zustand
- **Routing:** React Router DOM (v6)
- **PWA:** `vite-plugin-pwa` + Workbox
- **Unit Testing:** Vitest + `@testing-library/react` + `fake-indexeddb`
- **Hosting:** Vercel (configured via `vercel.json`)

---

## 🗄 Dexie Database Schema

Database Name: `OmrEventPosDB`

| Table Name | Indexed Fields | Purpose |
| :--- | :--- | :--- |
| `products` | `id, name, category, price, isActive, sortOrder` | Menu items, prices (in integer cents), categories, images |
| `stock` | `productId, updatedAt` | Opening, Stock In, Sold, Waste, Remaining quantities |
| `orders` | `id, orderNumber, createdAt, status, syncStatus, paymentMethod, eventId` | Order transactions, totals, status (`COMPLETED`, `CANCELLED`), sync status |
| `orderItems` | `id, orderId, productId` | Line items with unit price and quantities |
| `payments` | `id, orderId, method, status, paidAt` | Cash / QR payment records with tenders and change |
| `stockMovements` | `id, productId, type, createdAt, referenceId` | Audit log of all inventory changes (`OPENING`, `STOCK_IN`, `SALE`, `WASTE`, `ADJUSTMENT`, `SALE_CANCELLED_RETURN`) |
| `syncQueue` | `id, entityType, entityId, status, createdAt` | Sync queue tracking items pending transmission |
| `settings` | `key` | Event code, Event name, Outlet code, Device ID, API base URL, Mock mode toggle |

---

## 🧮 Stock Calculation Rules

The system adheres strictly to the following formula:

$$\text{Remaining} = \text{Opening} + \text{Stock In} - \text{Sold} - \text{Waste}$$

- **Add to Cart / Checkout:** Validates that `cart.quantity <= remainingQty`. If out of stock, addition is blocked.
- **Waste Recording:** Requires a non-empty reason and verifies `wasteQty <= remainingQty`.
- **Order Cancellation:** When an order is cancelled:
  - `soldQty` is decreased by `item.quantity`.
  - `remainingQty` increases by `item.quantity`.
  - An immutable `SALE_CANCELLED_RETURN` movement is added to the ledger.
  - Further cancellation attempts are blocked (`Error: Order is already cancelled`).
- **Physical Closing Stock Count:** Reconciles physical count with computer inventory, recording positive adjustments as stock-in or negative discrepancies as waste.

---

## 📡 Restaurant POS Synchronization Contract

### Endpoint
```http
POST /api/event-pos/sync
Content-Type: application/json
X-Device-Id: TAB-POS-01
X-Event-Id: EVT-2026-OMR01
X-Idempotency-Key: sync-1730700000-abc123
```

### Request Payload Specification
```json
{
  "eventId": "EVT-2026-OMR01",
  "deviceId": "TAB-POS-01",
  "outletCode": "OMR-MAIN",
  "syncTimestamp": "2026-11-04T09:30:00.000Z",
  "idempotencyKey": "sync-1730700000000-xyz789",
  "orders": [
    {
      "id": "ord-1730700000-a1b2c3d",
      "orderNumber": "OMR-20261104-0001",
      "createdAt": "2026-11-04T09:15:00.000Z",
      "subtotalAmount": 700,
      "totalAmount": 700,
      "paymentMethod": "CASH",
      "status": "COMPLETED",
      "syncStatus": "PENDING",
      "syncAttempts": 0,
      "eventId": "EVT-2026-OMR01",
      "deviceId": "TAB-POS-01",
      "outletCode": "OMR-MAIN",
      "idempotencyKey": "idemp-ord-1730700000-a1b2c3d"
    }
  ],
  "orderItems": [
    {
      "id": "item-1730700000-1",
      "orderId": "ord-1730700000-a1b2c3d",
      "productId": "prod-iced-latte",
      "productName": "Iced Latte",
      "unitPrice": 350,
      "quantity": 2,
      "totalPrice": 700
    }
  ],
  "payments": [
    {
      "id": "pay-1730700000-1",
      "orderId": "ord-1730700000-a1b2c3d",
      "method": "CASH",
      "amount": 700,
      "amountReceived": 1000,
      "changeGiven": 300,
      "status": "COMPLETED",
      "paidAt": "2026-11-04T09:15:00.000Z"
    }
  ],
  "stockMovements": [
    {
      "id": "sm-1730700000-1",
      "productId": "prod-iced-latte",
      "type": "SALE",
      "quantity": 2,
      "previousQty": 40,
      "newQty": 38,
      "reason": "Sale Order #OMR-20261104-0001",
      "referenceId": "ord-1730700000-a1b2c3d",
      "createdAt": "2026-11-04T09:15:00.000Z"
    }
  ]
}
```

### Expected Response
```json
{
  "success": true,
  "importedCounts": {
    "orders": 1,
    "items": 1,
    "payments": 1,
    "stockMovements": 1
  },
  "serverTimestamp": "2026-11-04T09:30:01.000Z",
  "message": "Transactions durably persisted"
}
```

### Development Mock vs. Live POS Server
- When **Development Mock Mode** is enabled (default in settings), orders are synced via an in-memory simulator and marked with status `MOCK_SYNCED`. The UI displays a warning banner stating that the transactions are **simulated for testing and NOT yet imported to a real POS server**.
- When Mock Mode is disabled, the system issues real HTTP requests. If the server is unreachable or returns an error, the orders are marked as `FAILED` and retained for future retry without data loss.

---

## 🚀 Setup & Local Development

### Prerequisites
- Node.js >= 18
- pnpm (recommended) or npm

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd pos-offline

# Install dependencies
pnpm install
```

### Running Locally
```bash
# Start development server
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser (preferably in tablet landscape view or Chrome DevTools Device Mode set to iPad / Android Tablet).

### Running Tests
```bash
# Run unit and integration tests with Vitest
pnpm test
```

### Production Build
```bash
# Type check and build bundle
pnpm build

# Preview production build locally
pnpm preview
```

---

## ☁️ Vercel Deployment Instructions

The application is pre-configured for seamless zero-config deployment to Vercel.

### Method 1: Deploy with Vercel CLI
```bash
# Install Vercel CLI globally (if not installed)
npm install -g vercel

# Deploy
vercel
```

### Method 2: Deploy via Vercel Web Dashboard (Git Integration)
1. Push this repository to GitHub or GitLab.
2. Go to [https://vercel.com/new](https://vercel.com/new).
3. Import the repository.
4. Framework Preset: **Vite**
5. Build Command: `pnpm build` (or `npm run build`)
6. Output Directory: `dist`
7. Click **Deploy**.

The bundled `vercel.json` ensures that:
- All client-side React Router paths (`/stock`, `/orders`, `/sync`, `/settings`) correctly route to `index.html`.
- Service worker (`sw.js`) and web app manifest (`manifest.webmanifest`) are served with correct MIME types and caching headers.

---

## 📱 Tablet Installation (PWA Standalone Mode)

To run as a full-screen tablet app without browser address bars:
1. Open the deployed Vercel URL on an iPad or Android Tablet in Safari or Chrome.
2. **On iPad (Safari):** Tap the **Share** button $\rightarrow$ select **"Add to Home Screen"**.
3. **On Android (Chrome):** Tap the **Menu (3 dots)** $\rightarrow$ select **"Install app"** or **"Add to Home screen"**.
4. Launch the app from the tablet home screen to enjoy the full offline landscape POS experience!

