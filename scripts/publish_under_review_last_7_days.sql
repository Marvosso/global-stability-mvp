-- One-time: Publish all UnderReview events from the last 7 days.
-- Run in Supabase SQL Editor (or psql). This makes recent drafts visible on the public map/homepage.
--
-- Step 1 (optional): Preview how many rows will be updated
-- SELECT count(*) FROM public.events WHERE status = 'UnderReview' AND occurred_at > now() - interval '7 days';
--
-- Step 2: Run the UPDATE
UPDATE public.events
SET status = 'Published'
WHERE status = 'UnderReview'
  AND occurred_at > now() - interval '7 days';
-- Add "RETURNING id" to the UPDATE to see affected row ids.
