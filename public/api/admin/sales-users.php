<?php
// Production sales-user management. Same contract as src/server/adminApi.ts (used by vite dev) —
// change both together. Lead assignment is the assign_leads() SQL function, not an endpoint.
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or ../webhooks/config.php.

header('Content-Type: application/json');

$cfg = file_exists(__DIR__ . '/../webhooks/config.php') ? require __DIR__ . '/../webhooks/config.php' : [];
$SB_URL = getenv('SUPABASE_URL') ?: ($cfg['SUPABASE_URL'] ?? '');
$SB_KEY = getenv('SUPABASE_SERVICE_ROLE_KEY') ?: ($cfg['SUPABASE_SERVICE_ROLE_KEY'] ?? '');
const BAN_FOREVER = '876000h';

function out($code, $body) {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

if (!$SB_URL || !$SB_KEY) out(500, ['error' => 'Supabase configuration missing']);

/** Calls Supabase with the service key, or with $bearer (a user's token) when given. */
function sb($path, $method = 'GET', $data = null, $bearer = null) {
    global $SB_URL, $SB_KEY;
    $ch = curl_init($SB_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => [
            "apikey: $SB_KEY",
            'Authorization: Bearer ' . ($bearer ?: $SB_KEY),
            'Content-Type: application/json',
            'Prefer: return=representation',
        ],
    ]);
    if ($data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $res = json_decode(curl_exec($ch), true);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400) out($code >= 500 ? 502 : $code, ['error' => $res['msg'] ?? $res['message'] ?? $res['error_description'] ?? $res['error'] ?? 'Supabase request failed']);
    return $res;
}

function profile($id) {
    $rows = sb('/rest/v1/profiles?select=*&id=eq.' . rawurlencode($id));
    return $rows[0] ?? null;
}

/** Deactivating bans the login and frees the rep's leads back to the unassigned pool. */
function set_active($id, $active) {
    sb("/auth/v1/admin/users/$id", 'PUT', ['ban_duration' => $active ? 'none' : BAN_FOREVER]);
    if (!$active) sb('/rest/v1/leads?assigned_to=eq.' . $id, 'PATCH', ['assigned_to' => null]);
}

// ── Caller must be an active manager ──
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
$token = preg_replace('/^Bearer /', '', $auth);
if (!$token) out(403, ['error' => 'Managers only']);
$me = sb('/auth/v1/user', 'GET', null, $token);
$caller = profile($me['id'] ?? '');
if (!$caller || !$caller['active'] || $caller['must_change_password'] || !in_array($caller['role'], ['owner', 'admin', 'manager'], true)) {
    out(403, ['error' => 'Managers only']);
}

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?: [];
// .htaccess rewrites /api/admin/sales-users/<id> to ?id=<id>.
$id = preg_match('/^[0-9a-f-]{36}$/', $_GET['id'] ?? '') ? $_GET['id'] : null;

if (!$id && $method === 'GET') {
    // ponytail: one page of 1000 auth users; loop on `page` if the team ever gets that big.
    $authUsers = sb('/auth/v1/admin/users?per_page=1000')['users'] ?? [];
    $profiles = [];
    foreach (sb('/rest/v1/profiles?select=*') as $p) $profiles[$p['id']] = $p;
    $leads = sb('/rest/v1/leads?select=assigned_to,status');
    $tasks = sb('/rest/v1/tasks?select=assigned_to,status');

    $users = [];
    foreach ($authUsers as $u) {
        $p = $profiles[$u['id']] ?? null;
        if (!$p) continue;
        $assigned = array_filter($leads, fn($l) => $l['assigned_to'] === $u['id']);
        $won = count(array_filter($assigned, fn($l) => str_ends_with($l['status'], '-won')));
        $users[] = [
            'id' => $u['id'],
            'email' => $u['email'],
            'full_name' => $p['full_name'],
            'phone' => $p['phone'],
            'role' => $p['role'],
            'active' => $p['active'],
            'is_sales' => $p['role'] === 'sales',
            'last_login' => $u['last_sign_in_at'] ?? null,
            'created_at' => $u['created_at'],
            'force_password_change' => $p['must_change_password'],
            'assigned_leads_count' => count($assigned),
            'open_tasks_count' => count(array_filter($tasks, fn($t) => $t['assigned_to'] === $u['id'] && $t['status'] === 'pending')),
            'won_deals' => $won,
            'conversion_rate' => count($assigned) ? round($won / count($assigned) * 100) : 0,
        ];
    }
    out(200, ['users' => $users]);
}

if (!$id && $method === 'POST') {
    $name = trim($input['name'] ?? '');
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $phone = trim($input['phone'] ?? '');
    $active = (bool)($input['active'] ?? true);
    $force = (bool)($input['force_password_change'] ?? true);
    if (!$name || !$email || !$password) out(400, ['error' => 'Name, email, and password are required']);

    $created = sb('/auth/v1/admin/users', 'POST', [
        'email' => $email,
        'password' => $password,
        'email_confirm' => true,
        'user_metadata' => ['full_name' => $name, 'phone' => $phone],
    ]);
    $newId = $created['id'] ?? $created['user']['id'];
    // handle_new_user made an inactive sales row; this sets what the admin asked for.
    sb("/rest/v1/profiles?id=eq.$newId", 'PATCH', [
        'full_name' => $name, 'phone' => $phone, 'role' => 'sales', 'active' => $active,
        'must_change_password' => $force, 'created_by' => $caller['id'],
    ]);
    if (!$active) set_active($newId, false);
    out(201, ['user' => ['id' => $newId, 'email' => $email, 'full_name' => $name, 'phone' => $phone, 'role' => 'sales', 'active' => $active, 'force_password_change' => $force]]);
}

if (!$id) out(404, ['error' => 'Endpoint not found']);
if ((profile($id)['role'] ?? null) !== 'sales') out(403, ['error' => 'Only sales users can be managed here']);

if ($method === 'PATCH') {
    // Password first: its trigger clears must_change_password, the profile update below sets it again.
    if (!empty($input['password'])) sb("/auth/v1/admin/users/$id", 'PUT', ['password' => $input['password']]);
    $prof = [];
    if (array_key_exists('name', $input)) $prof['full_name'] = $input['name'];
    if (array_key_exists('phone', $input)) $prof['phone'] = $input['phone'];
    if (array_key_exists('active', $input)) $prof['active'] = (bool)$input['active'];
    if (array_key_exists('force_password_change', $input)) $prof['must_change_password'] = (bool)$input['force_password_change'];
    if ($prof) sb("/rest/v1/profiles?id=eq.$id", 'PATCH', $prof);
    if (array_key_exists('active', $input)) set_active($id, (bool)$input['active']);
    out(200, ['success' => true, 'id' => $id]);
}

if ($method === 'DELETE') {
    sb("/rest/v1/profiles?id=eq.$id", 'PATCH', ['active' => false]);
    set_active($id, false);
    out(200, ['success' => true, 'id' => $id, 'soft_deleted' => true]);
}

out(404, ['error' => 'Endpoint not found']);
