# 🍽️ RestaurantIQ

Smart restaurant management & analytics SaaS for Ethiopian restaurants.

## Quick Start (see full step-by-step guide from Claude in chat)

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase keys
3. Run `supabase/schema.sql` in your Supabase SQL Editor
4. Create your first user in Supabase Auth, then insert matching rows into `restaurants` and `users` tables
5. `npm run dev`
6. Deploy to Vercel: push to GitHub, import in Vercel, add the same env vars

## Tech Stack
- Next.js 14 (App Router) + TypeScript + TailwindCSS
- Supabase (Postgres + Auth + Realtime)
- Recharts for analytics
- jsPDF / xlsx for report exports
- qrcode for table QR generation

## Project Structure
- `/app/auth` — login & password reset
- `/app/dashboard` — owner/manager dashboard, analytics, menu, inventory, staff, orders, customers, reports, settings
- `/app/pos` — cashier POS interface
- `/app/kitchen` — real-time kitchen display
- `/app/menu/[slug]/[table]` — public QR digital menu (no login)
- `/supabase/schema.sql` — full database schema + RLS policies
