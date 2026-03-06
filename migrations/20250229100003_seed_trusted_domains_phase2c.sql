-- Seed trusted domains after Phase 2C schema (idempotent upsert with new columns).
-- Requires 20250229100002_trusted_domains_phase2c.sql to have been run first.
-- If the Phase 2C columns are not present, this block does nothing (no error).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trusted_domains' AND column_name = 'default_reliability_tier'
  ) THEN
    INSERT INTO public.trusted_domains (domain, default_reliability_tier, is_enabled, notes)
    VALUES
      ('usgs.gov', 'High', true, null),
      ('gdacs.org', 'High', true, null),
      ('reliefweb.int', 'High', true, null),
      ('who.int', 'High', true, null),
      ('un.org', 'High', true, null),
      ('acleddata.com', 'High', true, null)
    ON CONFLICT (domain) DO UPDATE SET
      default_reliability_tier = excluded.default_reliability_tier,
      is_enabled = excluded.is_enabled,
      notes = excluded.notes;
  END IF;
END $$;
