-- Seed initial trusted domains for auto-approval (runs before Phase 2C migration).
-- If Phase 2C schema is already applied (old columns dropped), this block does nothing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trusted_domains' AND column_name = 'source_name'
  ) THEN
    INSERT INTO public.trusted_domains (domain, source_name, source_type, reliability_tier, ecosystem_key)
    VALUES
      ('usgs.gov', 'USGS Earthquakes', 'Official', 'High', 'usgs.gov'),
      ('gdacs.org', 'GDACS', 'Official', 'High', 'gdacs.org'),
      ('acleddata.com', 'ACLED', 'Official', 'High', 'acleddata.com'),
      ('reliefweb.int', 'ReliefWeb', 'NGO', 'High', 'reliefweb.int')
    ON CONFLICT (domain) DO UPDATE SET
      source_name = excluded.source_name,
      source_type = excluded.source_type,
      reliability_tier = excluded.reliability_tier,
      ecosystem_key = excluded.ecosystem_key;
  END IF;
END $$;
