-- Seed event_sequences with sample pattern for testing Scenario Analysis UI.
-- Pattern: Political Tension | Protest | High -> 32% Regional escalation, 41% Localized conflict, 27% De-escalation.

insert into public.event_sequences (
  sequence_key,
  category,
  subtype,
  severity_pattern,
  outcome,
  count
) values
  ('Political Tension|Protest|High', 'Political Tension', 'Protest', 'High', 'Regional escalation', 32),
  ('Political Tension|Protest|High', 'Political Tension', 'Protest', 'High', 'Localized conflict', 41),
  ('Political Tension|Protest|High', 'Political Tension', 'Protest', 'High', 'De-escalation', 27)
on conflict (sequence_key, outcome) do update set
  count = excluded.count,
  updated_at = now();
