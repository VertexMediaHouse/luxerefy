<?php
// 99acres lead push -> Supabase `leads`. POST JSON, header X-99acres-Secret.
declare(strict_types=1);
header('Content-Type: application/json');

function out(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body);
  exit;
}

$cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$env = fn(string $k): string => (string) (getenv($k) ?: ($cfg[$k] ?? ''));
$secret = $env('WEBHOOK_99ACRES_SECRET');
$SB_URL = rtrim($env('SUPABASE_URL'), '/');
$SB_KEY = $env('SUPABASE_SERVICE_ROLE_KEY');
if ($secret === '' || $SB_URL === '' || $SB_KEY === '') out(500, ['error' => 'Webhook not configured']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['error' => 'Use POST']);
if (!hash_equals($secret, (string) ($_SERVER['HTTP_X_99ACRES_SECRET'] ?? ''))) out(401, ['error' => 'Bad or missing X-99acres-Secret']);

$data = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($data)) out(400, ['error' => 'Body must be a JSON object']);

// Case-insensitive lookup in the top level, then other_fields. Same keys as parse99acres in src/lib/rules.ts.
$top = array_change_key_case($data, CASE_LOWER);
$extra = is_array($top['other_fields'] ?? null) ? array_change_key_case($top['other_fields'], CASE_LOWER) : [];
$pick = function (string ...$keys) use ($top, $extra): ?string {
  foreach ([$top, $extra] as $src)
    foreach ($keys as $k)
      if (isset($src[$k]) && is_scalar($src[$k]) && trim((string) $src[$k]) !== '') return trim((string) $src[$k]);
  return null;
};

// Port of normalizePhone in src/lib/rules.ts. Keep the two in sync: contacts dedupe on this value.
function normalize_phone(?string $raw): ?string {
  if ($raw === null) return null;
  $s = trim($raw);
  $d = preg_replace('/\D/', '', $s);
  if (str_starts_with($s, '+') && !str_starts_with($s, '+91')) return strlen($d) >= 8 && strlen($d) <= 15 ? "+$d" : null;
  $local = preg_replace('/^(?:91|0)(?=\d{10}$)/', '', $d);
  return preg_match('/^[6-9]\d{9}$/', $local) ? "+91$local" : null;
}

$phone = normalize_phone($pick('phone', 'mobile', 'phone_number', 'mobile_number', 'contact'));
if ($phone === null) out(422, ['error' => 'Missing or invalid phone']);

function sb(string $method, string $path, ?array $body = null): array {
  global $SB_URL, $SB_KEY;
  $ch = curl_init("$SB_URL/rest/v1/$path");
  $opts = [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    // apikey alone works for both sb_secret_ and legacy service_role keys.
    CURLOPT_HTTPHEADER => ["apikey: $SB_KEY", 'Content-Type: application/json', 'Prefer: return=representation'],
  ];
  if ($body !== null) $opts[CURLOPT_POSTFIELDS] = json_encode($body);
  curl_setopt_array($ch, $opts);
  $res = curl_exec($ch);
  $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  if ($status >= 300 || $status === 0) error_log("99acres webhook: $method $path -> $status " . (is_string($res) ? $res : curl_error($ch)));
  curl_close($ch);
  return [$status, is_string($res) ? json_decode($res, true) : null];
}
function fail(): void { out(502, ['error' => 'Database error']); }

// Find or create the contact (phone is unique).
$findContact = function () use ($phone): ?string {
  [$st, $rows] = sb('GET', 'contacts?select=id&phone=eq.' . rawurlencode($phone));
  if ($st !== 200) fail();
  return $rows[0]['id'] ?? null;
};
$contactId = $findContact();
if ($contactId === null) {
  $email = $pick('email');
  [$st, $rows] = sb('POST', 'contacts', [
    'name' => $pick('name', 'lead_name', 'buyer_name') ?? '99acres buyer',
    'phone' => $phone,
    'email' => $email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
    'kind' => 'lead',
  ]);
  if ($st === 201) $contactId = $rows[0]['id'];
  elseif ($st === 409) $contactId = $findContact(); // same phone inserted concurrently
  if ($contactId === null) fail();
}

// First pipeline by position; its entry stage is "<id>-new" (entryOf in rules.ts).
[$st, $rows] = sb('GET', 'pipelines?select=id&order=position.asc&limit=1');
if ($st !== 200) fail();
$pipelineId = $rows[0]['id'] ?? 'pl-1';

[$st, $rows] = sb('POST', 'leads', [
  'contact_id' => $contactId,
  'source' => '99acres',
  'pipeline_id' => $pipelineId,
  'status' => "$pipelineId-new",
  'property_interest' => $pick('property', 'project', 'property_name', 'interest'),
  'city' => $pick('city'),
  'external_ref' => $pick('lead_id', 'query_id', 'id'),
  'notes' => $pick('message', 'query', 'comments') ?? '',
  'raw_payload' => $data,
]);
if ($st !== 201) fail();

out(200, ['id' => $rows[0]['id']]);
