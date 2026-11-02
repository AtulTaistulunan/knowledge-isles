// 知識群島：把玩家的作答送到老師的 Google 試算表（每座島的網頁共用）
// 老師的試算表裡有一段 Apps Script（見 google-sheet/README.md），部署成網頁應用程式後會得到一個網址，貼到下面的 ENDPOINT。
// ENDPOINT 是空的就不送（遊戲照常玩）。
//   Record.log({ island, station, item, type, answer, correct, attempt, round, seconds })   記一筆
//   Record.attempt(key)        同一題又答了一次：回傳這是第幾次（存在瀏覽器裡，換頁、重新整理也接得上）
//   Record.clearAttempt(key)   這一題答對了：下次從第 1 次重新算
//   Record.round(key)          這一站又開始一輪：回傳這是第幾輪
// 送不出去（沒網路、試算表忙）的資料先存在瀏覽器裡，之後自動補送。
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbyYIM27H8itpGyX7qWPsV6bdp61sBeAjoFFUWAMdX5jfXE7g207HO1Ozk4wUPY88_K41g/exec';      // ← 貼上 Apps Script 網頁應用程式的網址（https://script.google.com/macros/s/……/exec）

  var QUEUE = 'knowledgeIsles.recordQueue', COUNT = 'knowledgeIsles.recordCount';
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } }
  // 測試用：localStorage 的 knowledgeIsles.recordEndpoint 可以暫時換成別的網址
  function endpoint() { try { return localStorage.getItem('knowledgeIsles.recordEndpoint') || ENDPOINT; } catch (e) { return ENDPOINT; } }

  var queue = load(QUEUE, []), sending = false;
  function seat() { return (window.Player && Player.seat) || ''; }
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() {
    var d = new Date();
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function log(o) {
    if (!endpoint()) return;
    queue.push({
      id: id(), time: now(), seat: seat(),
      island: o.island || '', station: o.station || '', item: o.item || '', type: o.type || '',
      answer: o.answer == null ? '' : String(o.answer),
      correct: o.correct === true ? '✓' : o.correct === false ? '✗' : '',
      attempt: o.attempt || '', round: o.round || '',
      seconds: o.seconds == null ? '' : Math.round(o.seconds)
    });
    if (queue.length > 2000) queue = queue.slice(-2000);       // 瀏覽器裡最多暫存 2000 筆
    store(QUEUE, queue);
    flush();
  }

  // 一次送一批。Apps Script 不回傳跨網域的標頭，所以用 no-cors：只要請求送到了就算成功
  function flush() {
    var url = endpoint();
    if (!url || sending || !queue.length) return;
    if (navigator.onLine === false) return;
    sending = true;
    var batch = queue.slice(0, 50);
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ rows: batch }) })
      .then(function () {
        var sent = {}; batch.forEach(function (r) { sent[r.id] = 1; });
        queue = queue.filter(function (r) { return !sent[r.id]; });
        store(QUEUE, queue);
        sending = false;
        if (queue.length) flush();
      })
      .catch(function () { sending = false; });               // 送不出去就留著，等一下再試
  }
  // 換頁（例如過橋到另一座島）時，用 sendBeacon 把還沒送的資料送出去
  addEventListener('pagehide', function () {
    var url = endpoint();
    if (!url || !queue.length || !navigator.sendBeacon) return;
    if (navigator.sendBeacon(url, new Blob([JSON.stringify({ rows: queue })], { type: 'text/plain;charset=utf-8' }))) { queue = []; store(QUEUE, queue); }
  });
  addEventListener('online', flush);
  setInterval(flush, 30000);
  setTimeout(flush, 3000);

  // 計數器：依照班級座號分開存，換人玩同一台電腦也不會混在一起
  function bump(key, reset) {
    var c = load(COUNT, {}), k = seat() + '|' + key;
    if (reset) delete c[k]; else c[k] = (c[k] || 0) + 1;
    store(COUNT, c);
    return c[k] || 0;
  }

  window.Record = {
    log: log,
    flush: flush,
    attempt: function (key) { return bump('try:' + key); },
    clearAttempt: function (key) { bump('try:' + key, true); },
    round: function (key) { return bump('round:' + key); },
    get pending() { return queue.length; }
  };
})();
