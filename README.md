# SRK Enterprises — Billing Application

Desktop billing app for SRK Enterprises (water / can supply): create invoices, manage products & customers, track payments, and view simple sales reports.

## Run locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:3000`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Typecheck (`tsc --noEmit`) |

## Features

- **Billing** — quick invoice creation from product list
- **Invoices** — view, print tax invoice, record payments
- **Products** — prices & pack sizes (boxes and litre cans)
- **Customers** — buyer directory
- **Payments** — collection tracking
- **Reports** — sales / payments / products charts
- **Settings** — company, bank, GST defaults, backup

Data is stored offline in the browser (`localStorage`).
