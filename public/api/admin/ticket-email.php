<?php
// Emails a new ticket via Resend. Same contract as ticketEmail() in src/server/adminApi.ts — change both together.
// Only the ticket's raiser can trigger it; content is read from the DB, so it can't send arbitrary mail.

header('Content-Type: application/json');

$cfg = file_exists(__DIR__ . '/../webhooks/config.php') ? require __DIR__ . '/../webhooks/config.php' : [];
$env = fn($k, $d = '') => getenv($k) ?: ($cfg[$k] ?? $d);
$SB_URL = $env('SUPABASE_URL');
$SB_KEY = $env('SUPABASE_SERVICE_ROLE_KEY');
$RESEND = $env('RESEND_API_KEY');

function out($code, $body) { http_response_code($code); echo json_encode($body); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['error' => 'POST only']);
if (!$SB_URL || !$SB_KEY || !$RESEND) out(500, ['error' => 'Email configuration missing']);

function call($url, $method, $headers, $data = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers]);
    if ($data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $res = json_decode(curl_exec($ch), true);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, $res];
}
$sb = fn($path, $bearer = null) => call($SB_URL . $path, 'GET', ["apikey: $SB_KEY", 'Authorization: Bearer ' . ($bearer ?: $SB_KEY)]);

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
$token = preg_replace('/^Bearer /', '', $auth);
[, $me] = $token ? $sb('/auth/v1/user', $token) : [0, null];
$id = json_decode(file_get_contents('php://input'), true)['id'] ?? '';
[, $rows] = $sb('/rest/v1/tickets?select=number,title,description,raised_by&id=eq.' . rawurlencode($id));
$t = $rows[0] ?? null;
if (empty($me['id']) || !$t || $t['raised_by'] !== $me['id']) out(403, ['error' => 'Not your ticket']);
[, $p] = $sb('/rest/v1/profiles?select=full_name&id=eq.' . rawurlencode($me['id']));

[$code, $res] = call('https://api.resend.com/emails', 'POST', ["Authorization: Bearer $RESEND", 'Content-Type: application/json'], [
    'from' => $env('TICKET_EMAIL_FROM', 'Luxerefy CRM <onboarding@resend.dev>'),
    'to' => $env('TICKET_EMAIL_TO', 'dhrumil@vertexmediahouse.com'),
    'subject' => "[Ticket #{$t['number']}] {$t['title']}",
    'text' => $t['description'] . "\n\n— Raised by " . ($p[0]['full_name'] ?? $me['email']),
]);
$code < 300 ? out(200, ['success' => true]) : out(502, ['error' => $res['message'] ?? 'Email failed']);
