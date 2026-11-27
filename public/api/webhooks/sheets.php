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

// leads.source is a check-constrained enum: anything else makes capture_leads reject the row.
// A landing-page sheet usually has no source column at all, so default to 'website'.
const SOURCES = ['99acres', 'magic_bricks', 'social_media', 'website', 'property_page', 'print_ad', 'jbn', 'referral', 'walk_in', 'sales_form', 'other'];
$rawSource = $pick('source', 'cp', 'channelpartner', 'partner');
$source = 'website';
if ($rawSource !== null) {
  $s = preg_replace('/[^a-z0-9]+/', '_', strtolower($rawSource));
  if (in_array($s, SOURCES, true)) $source = $s;
  elseif ($s === 'walkin') $source = 'walk_in';
  else $source = 'referral'; // a named channel partner; kept verbatim in referral_detail below
}

// "CTA / Source section" tells you which button on the page was used - keep it with the message.
$cta = $pick('ctasourcesection', 'cta', 'sourcesection', 'section');
$message = $pick('message', 'remarks', 'comments', 'notes', 'query');
if ($cta !== null) $message = $message === null ? "Via: $cta" : "$message (via: $cta)";

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
    'source' => $source,
    'referral_detail' => $source === 'referral' ? $rawSource : null,
    // "Residence" on the landing page is the unit asked for; "Interest" is investor vs end-user.
    'property_interest' => $pick('residence', 'property', 'project', 'propertyname', 'configuration', 'unittype'),
    'lead_type' => $pick('interest', 'leadtype', 'buyertype'),
    'city' => $pick('city', 'location'),
    'external_ref' => $pick('rowid', 'row', 'leadid', 'id'),
    'message' => $message,
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
