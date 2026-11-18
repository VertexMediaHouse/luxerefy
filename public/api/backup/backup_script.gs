/**
 * Luxerefy CRM - Google Sheets Cloud Backup Web App
 * 
 * INSTRUCTIONS:
 * 1. Open your Google Sheet in the browser (use the normal edit URL: https://docs.google.com/spreadsheets/d/.../edit).
 * 2. In the top menu, go to: Extensions > Apps Script.
 * 3. Delete any boilerplate code inside Code.gs and paste this entire code.
 * 4. Click the Save icon (💾).
 * 5. Click "Deploy" (top right) > "New deployment".
 * 6. Click the gear icon (⚙️) next to "Select type" and pick "Web app".
 * 7. Set Description: "Luxerefy CRM Backup".
 * 8. Set "Execute as": "Me (<your email>)".
 * 9. Set "Who has access": "Anyone" (essential so the CRM client can POST data).
 * 10. Click "Deploy" and Authorize access with your Google account.
 * 11. Copy the generated "Web app URL" (ends in /exec).
 * 12. Add this Web app URL and your Sheet URL to your .env.local file:
 *     VITE_GOOGLE_SHEET_URL="https://docs.google.com/spreadsheets/d/<YOUR_SHEET_ID>/edit"
 *     VITE_GOOGLE_SCRIPT_WEBAPP_URL="https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJson({ status: 'error', message: 'No payload received' });
    }

    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tables = payload.tables || {};
    var takenAt = payload.taken_at || new Date().toISOString();
    var version = payload.version || 3;

    var tableNames = [
      'leads',
      'contacts',
      'properties',
      'pipelines',
      'stages',
      'tasks',
      'tickets',
      'documents',
      'profiles',
      'lead_activities'
    ];

    var summaryData = [
      ['Luxerefy CRM Backup Info', ''],
      ['Last Synced (UTC)', takenAt],
      ['Backup Version', version],
      ['Sync Timestamp', new Date().toLocaleString()],
      ['', ''],
      ['Table Name', 'Record Count']
    ];

    for (var i = 0; i < tableNames.length; i++) {
      var tableName = tableNames[i];
      var rows = tables[tableName] || [];
      summaryData.push([tableName, rows.length]);
      writeTableToSheet(ss, tableName, rows);
    }

    // Write Overview Tab
    var summarySheet = ss.getSheetByName('Overview');
    if (!summarySheet) {
      summarySheet = ss.insertSheet('Overview', 0);
    }
    summarySheet.clear();
    summarySheet.getRange(1, 1, summaryData.length, 2).setValues(summaryData);
    summarySheet.getRange('A1:B1').setFontWeight('bold').setFontSize(12).setBackground('#e2e8f0');
    summarySheet.getRange('A6:B6').setFontWeight('bold').setBackground('#f1f5f9');
    summarySheet.setColumnWidth(1, 180);
    summarySheet.setColumnWidth(2, 120);

    return respondJson({
      status: 'success',
      message: 'Backup completed successfully',
      tablesUpdated: tableNames.length,
      syncedAt: takenAt
    });
  } catch (err) {
    return respondJson({ status: 'error', message: err.toString() });
  }
}

function writeTableToSheet(ss, tableName, rows) {
  var sheet = ss.getSheetByName(tableName);
  if (!sheet) {
    sheet = ss.insertSheet(tableName);
  }
  sheet.clear();

  if (!rows || rows.length === 0) {
    sheet.getRange(1, 1).setValue('(No records)');
    return;
  }

  // Extract all distinct keys as headers
  var headerMap = {};
  var headers = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (typeof row === 'object' && row !== null) {
      for (var key in row) {
        if (!headerMap[key]) {
          headerMap[key] = true;
          headers.push(key);
        }
      }
    }
  }

  if (headers.length === 0) return;

  var grid = [headers];
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var gridRow = [];
    for (var j = 0; j < headers.length; j++) {
      var val = item ? item[headers[j]] : '';
      if (val === undefined || val === null) {
        gridRow.push('');
      } else if (typeof val === 'object') {
        gridRow.push(JSON.stringify(val));
      } else {
        gridRow.push(val);
      }
    }
    grid.push(gridRow);
  }

  sheet.getRange(1, 1, grid.length, headers.length).setValues(grid);

  // Format header row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0f172a');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
