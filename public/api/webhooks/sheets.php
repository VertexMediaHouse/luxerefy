<?php
// Google Sheet row -> Supabase `leads`. POST JSON, header X-Sheets-Secret.
// Paired with public/api/webhooks/sheets.gs (Apps Script onFormSubmit/onEdit trigger).
declare(strict_types=1);
header('Content-Type: application/json');

function out(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body);
  exit;
}

$cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$env = fn(string $k): string => (string) (getenv($k) ?: ($cfg[$k] ?? ''));
$secret = $env('WEBHOOK_SHEETS_SECRET');
$SB_URL = rtrim($env('SUPABASE_URL'), '/');
$SB_KEY = $env('SUPABASE_SERVICE_ROLE_KEY');
if ($secret === '' || $SB_URL === '' || $SB_KEY === '') out(500, ['error' => 'Webhook not configured']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['error' => 'Use POST']);
if (!hash_equals($secret, (string) ($_SERVER['HTTP_X_SHEETS_SECRET'] ?? ''))) out(401, ['error' => 'Bad or missing X-Sheets-Secret']);

$data = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($data)) out(400, ['error' => 'Body must be a JSON object']);

// Sheet headers become keys, so match loosely: lowercase, spaces/underscores stripped.
$norm = [];
foreach ($data as $k => $v) $norm[preg_replace('/[^a-z0-9]/', '', strtolower((string) $k))] = $v;
$pick = function (string ...$keys) use ($norm): ?string {
  foreach ($keys as $k)
    if (isset($norm[$k]) && is_scalar($norm[$k]) && trim((string) $norm[$k]) !== '') return trim((string) $norm[$k]);
  return null;
};

$phone = $pick('phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact', 'contactnumber', 'whatsapp');
if ($phone === null) out(422, ['error' => 'Missing phone']);
$email = $pick('email', 'emailaddress', 'emailid');

$ch = curl_init("$SB_URL/rest/v1/rpc/capture_leads");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 10,
  CURLOPT_HTTPHEADER => ["apikey: $SB_KEY", 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['rows' => [[
    'name' => $pick('name', 'fullname', 'leadname', 'customername', 'clientname') ?? 'Sheet lead',
    'phone' => $phone,
    'email' => $email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
    // Channel partner / sheet name, so you can tell which CP sent the lead.
    'source' => $pick('source', 'cp', 'channelpartner', 'partner') ?? 'google-sheet',
    'property_interest' => $pick('property', 'project', 'propertyname', 'interest', 'configuration', 'unittype'),
    'city' => $pick('city', 'location'),
    'external_ref' => $pick('rowid', 'row', 'leadid', 'id'),
    'message' => $pick('message', 'remarks', 'comments', 'notes', 'query'),
    'raw_payload' => $data,
  ]]]),
]);
$res = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
if ($status !== 200) error_log("sheets webhook: capture_leads -> $status " . (is_string($res) ? $res : curl_error($ch)));
curl_close($ch);
if ($status !== 200) out(502, ['error' => 'Database error']);

$r = (json_decode((string) $res, true) ?? [])[0] ?? null;
if (!is_array($r)) out(502, ['error' => 'Database error']);
if (isset($r['error'])) out(422, ['error' => $r['error']]);
out(200, ['id' => $r['id'], 'created' => $r['created']]);
