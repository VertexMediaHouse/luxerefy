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

$phone = $pick('phone', 'mobile', 'phone_number', 'mobile_number', 'contact');
if ($phone === null) out(422, ['error' => 'Missing phone']);
$email = $pick('email');

// Same capture path as the app and public forms (capture_leads in supabase/schema.sql):
// normalises the phone, dedupes by contact, books tomorrow's first call.
$ch = curl_init("$SB_URL/rest/v1/rpc/capture_leads");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 10,
  // apikey alone works for both sb_secret_ and legacy service_role keys.
  CURLOPT_HTTPHEADER => ["apikey: $SB_KEY", 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['rows' => [[
    'name' => $pick('name', 'lead_name', 'buyer_name') ?? '99acres buyer',
    'phone' => $phone,
    'email' => $email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
    'source' => '99acres',
    'property_interest' => $pick('property', 'project', 'property_name', 'interest'),
    'city' => $pick('city'),
    'external_ref' => $pick('lead_id', 'query_id', 'id'),
    'message' => $pick('message', 'query', 'comments'),
    'raw_payload' => $data,
  ]]]),
]);
$res = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
if ($status !== 200) error_log("99acres webhook: capture_leads -> $status " . (is_string($res) ? $res : curl_error($ch)));
curl_close($ch);
if ($status !== 200) out(502, ['error' => 'Database error']);

$r = (json_decode((string) $res, true) ?? [])[0] ?? null;
if (!is_array($r)) out(502, ['error' => 'Database error']);
if (isset($r['error'])) out(422, ['error' => $r['error']]);
// created=false: this number already had an open lead; the enquiry was logged on it instead of duplicating.
out(200, ['id' => $r['id'], 'created' => $r['created']]);
