-- Add Magic Bricks as a lead source.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN (
  '99acres', 'magic_bricks', 'social_media', 'website', 'property_page', 'print_ad', 'jbn', 'referral', 'walk_in', 'sales_form', 'other'));
