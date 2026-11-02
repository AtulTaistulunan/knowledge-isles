// 知識群島：作答紀錄
// 貼到 Google 試算表的「擴充功能 → Apps Script」，部署成網頁應用程式（存取權：所有人）。
// 遊戲每次送來一批作答（JSON：{ rows: [...] }），這裡把每一筆加到「作答紀錄」工作表的最後一列。

var SHEET = '作答紀錄';
var COLS = [
  ['time', '時間'], ['seat', '班級座號'], ['island', '島'], ['station', '實驗站'], ['type', '類型'],
  ['item', '題目／項目'], ['answer', '回答'], ['correct', '對錯'], ['attempt', '第幾次嘗試'],
  ['round', '第幾輪'], ['seconds', '花費秒數'], ['id', '紀錄編號']
];
var NUM = { attempt: 1, round: 1, seconds: 1 };

function doPost(e) {
  var rows = [];
  try { rows = JSON.parse(e.postData.contents).rows || []; } catch (err) { return out('bad json'); }
  if (!rows.length) return out('empty');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // 全班同時送資料時，一個一個寫，不會互相蓋掉
  try {
    var sh = sheet();
    // 同一筆可能因為網路重送而收到兩次：用紀錄編號擋掉最近已經寫過的
    var last = sh.getLastRow(), seen = {};
    if (last > 1) {
      var from = Math.max(2, last - 500);
      sh.getRange(from, COLS.length, last - from + 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });
    }
    var values = rows.filter(function (r) { return r && r.id && !seen[r.id]; })
      .slice(0, 500)
      .map(function (r) {
        return COLS.map(function (c) {
          var v = r[c[0]];
          if (v == null || v === '') return '';
          return NUM[c[0]] && !isNaN(Number(v)) ? Number(v) : String(v).slice(0, 500);   // 次數、秒數存成數字，方便算平均
        });
      });
    if (values.length) sh.getRange(sh.getLastRow() + 1, 1, values.length, COLS.length).setValues(values);
  } finally {
    lock.releaseLock();
  }
  return out('ok');
}

// 用瀏覽器打開網址時看到「知識群島作答紀錄：運作中」，表示部署成功
function doGet() { return out('知識群島作答紀錄：運作中'); }

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map(function (c) { return c[1]; })]).setFontWeight('bold').setBackground('#fef3c7');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@');   // 班級座號當文字存，901-05 才不會被當成日期
  }
  return sh;
}

function out(s) { return ContentService.createTextOutput(s); }
