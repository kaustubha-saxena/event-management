# Supabase migration workflow

Migrations are applied with the Supabase CLI after linking the intended project:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review each SQL migration before applying it to production. The core migration creates the app schema, enables RLS, restricts table grants to the server service role, and adds RPCs for operations that must be atomic. Do not put the service-role key or Supabase access token in source control.

The existing project used MySQL. This migration does not import MySQL records. Back up any real source database first, then plan and verify a deliberate one-time transformation before importing user/event data.
