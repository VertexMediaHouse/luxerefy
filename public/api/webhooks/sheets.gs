// Apps Script for the CP lead sheet. Extensions > Apps Script, paste, then:
//   1. Project Settings > Script properties: CRM_URL = https://your-crm/api/webhooks/sheets.php
//      and CRM_SECRET = the same value as WEBHOOK_SHEETS_SECRET in config.php
//   2. Triggers > Add trigger > pushLead > From spreadsheet > On form submit
//      (no attached Form? use "On change" instead - it fires on pasted/typed rows too)
// Row 1 must be the header row; its cells become the JSON keys.

function pushLead(e) {
  var sheet = (e && e.range ? e.range.getSheet() : SpreadsheetApp.getActiveSheet());
  var lastRow = (e && e.range ? e.range.getRow() : sheet.getLastRow());
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  var payload = { row_id: sheet.getName() + '!' + lastRow };
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i]).trim();
    if (key) payload[key] = values[i] instanceof Date ? values[i].toISOString() : String(values[i]);
  }

  var props = PropertiesService.getScriptProperties();
  var res = UrlFetchApp.fetch(props.getProperty('CRM_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sheets-Secret': props.getProperty('CRM_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  // Failures land in Apps Script > Executions; the sheet row is kept either way.
  if (res.getResponseCode() !== 200) console.error('CRM push ' + res.getResponseCode() + ': ' + res.getContentText());
}

// Run once by hand to push rows that already exist in the sheet.
function backfill() {
  var sheet = SpreadsheetApp.getActiveSheet();
  for (var r = 2; r <= sheet.getLastRow(); r++) pushLead({ range: sheet.getRange(r, 1) });
}
