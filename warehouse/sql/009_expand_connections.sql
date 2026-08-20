-- Allow the three new source types (doc Sec 2.1's connector catalog).
ALTER TABLE app.connections DROP CONSTRAINT connections_source_type_check;
ALTER TABLE app.connections ADD CONSTRAINT connections_source_type_check
    CHECK (source_type IN ('shopify', 'google_ads', 'meta_ads', 'netsuite'));

-- Sync visibility: what actually happened, not just pass/fail (this was a real product
-- gap -- job_runs recorded status but never what was synced, so "how is sync going" had no
-- real answer beyond a status pill).
ALTER TABLE app.job_runs ADD COLUMN records_synced jsonb;
