This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Backend setup (one-time)

The app uses **Supabase Postgres** for the database, **Supabase Auth** for login, and **Prisma** as the ORM. Do this once when you clone the project.

### 1. Create the Supabase project

1. Go to https://supabase.com and sign in (GitHub or email).
2. Click **New project**.
3. Fill in:
   - **Name:** `reviewpilot` (anything you like)
   - **Database password:** generate a strong one and **save it in your password manager** — you'll need it in step 2.
   - **Region:** pick the one closest to you.
   - **Plan:** Free is fine for the MVP.
4. Click **Create new project** and wait ~1 minute for it to provision.

### 2. Copy your secrets into `.env.local`

Copy the example file:

```bash
cp .env.local.example .env.local
```

Then fill in each value from the Supabase dashboard:

- **`NEXT_PUBLIC_SUPABASE_URL`** — Settings → API → *Project URL*
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — Settings → API → *anon public* key (safe for the browser)
- **`DATABASE_URL`** — Settings → Database → *Connection string* → **Transaction pooler** (port 6543). Replace `[YOUR-PASSWORD]` with the password from step 1, and append `?pgbouncer=true&connection_limit=1` to the end.
- **`DIRECT_URL`** — Same screen, **Session pooler** (port 5432) or direct connection. Replace `[YOUR-PASSWORD]` the same way.

### 3. Install dependencies and run the first migration

```bash
npm install
npm run db:migrate -- --name init
```

The migrate command creates the tables in your Supabase database and generates the Prisma client. If you open the Supabase dashboard → **Table editor**, you should now see `businesses`, `customers`, `messages`, `message_templates`, and `missed_leads`.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful commands

```bash
npm run db:migrate      # create a new migration after editing prisma/schema.prisma
npm run db:studio       # open Prisma Studio to browse/edit data
npm run db:generate     # regenerate the Prisma client (rarely needed manually)
```

### Where things live

- `prisma/schema.prisma` — database schema (Business, Customer, Message, MessageTemplate, MissedLead)
- `lib/prisma.ts` — singleton Prisma client; import with `import { prisma } from "@/lib/prisma"`
- `lib/supabase/server.ts` — Supabase client for server components/actions
- `lib/supabase/client.ts` — Supabase client for `"use client"` components
- `middleware.ts` — refreshes the auth session on every request

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
