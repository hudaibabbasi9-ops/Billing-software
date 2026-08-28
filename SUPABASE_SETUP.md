# BillPro persistent database setup

BillPro now uses PostgreSQL/Supabase for production persistence.

## 1. Create the database

Create a Supabase project, then open its PostgreSQL connection details.
Use a connection string that your deployment can reach (the Supabase pooler connection is recommended for serverless workloads).

## 2. Add the Vercel environment variables

In the Vercel project settings, add:

- `DATABASE_URL` = your PostgreSQL/Supabase connection string
- `SECRET_KEY` = a long random secret string

Enable the variables for Production (and Preview/Development if needed).

## 3. Deploy

Redeploy the project. On its first request, BillPro automatically creates the `billpro_state` table and initializes the default admin account if the table is empty.

Default first-run login:

- Username: `admin`
- Password: `admin123`

**Change the default password before using the application with real customer data.**

## How persistence works

The existing BillPro API keeps its current JSON-shaped data model. The complete state is stored in one PostgreSQL `JSONB` row. This avoids changing the frontend while moving persistence off the ephemeral Vercel filesystem.

The local `data/billpro.json` fallback is intentionally disabled by the Vercel entry point. If `DATABASE_URL` is missing in production, the app returns a clear configuration error instead of silently writing data that can disappear.
