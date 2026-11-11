<?php
// Copy to config.php on the server (gitignored). Real env vars, if set, win over these.
return [
  'WEBHOOK_99ACRES_SECRET' => 'long-random-string',
  'WEBHOOK_SHEETS_SECRET' => 'another-long-random-string',
  'SUPABASE_URL' => 'https://YOUR-PROJECT.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY' => 'sb_secret_...',
];
