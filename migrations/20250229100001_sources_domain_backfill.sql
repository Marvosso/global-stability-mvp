-- Backfill sources.domain from url (best-effort: protocol/path stripped, www removed).
-- This is intentionally simple and idempotent; it will not overwrite
-- any domains that have already been set.

update public.sources
set domain = lower(
  regexp_replace(
    split_part(
      split_part(nullif(trim(url), ''), '//', 2),
      '/',
      1
    ),
    '^www\\.',
    ''
  )
)
where url is not null
  and trim(url) <> ''
  and (domain is null or trim(domain) = '');

