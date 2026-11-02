// 知識群島：玩家的名字與破關證書（五座島的網頁共用）
// 名字存在這台電腦的瀏覽器裡（knowledgeIsles.player），每座島都讀同一份，所以只要問一次。
//   Player.name                       目前的名字（還沒填是空字串）
//   Player.seat                       班級座號，例如 901-05（老師的作答紀錄試算表用這個辨認學生，不送名字）
//   Player.fill(text)                 把文字裡的 {name} 換成名字（教材的故事可以寫 {name}）
//   Player.ensure(cb)                 還沒有名字就先跳出問名字的視窗，填好再執行 cb；已經有名字就直接執行
//   Player.badge(el, { color, cert })  在開始畫面放「玩家：○○　改名」；cert() 回傳證書資料時多一個「證書」按鈕
//   Player.refresh()                  重畫名牌（例如剛破關，要多出證書按鈕）
//   Player.onChange(cb)               改名之後要更新畫面上的名字
//   Player.certificate({ island, sub, icon, color, line, onClose })   破關證書
(function () {
  var KEY = 'knowledgeIsles.player';
  var MAX = 12;
  var data = {};
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* 無法讀取就當作還沒填 */ }
  var waiting = [], listeners = [];

  var css = [
    '.pl-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;',
    '  background:rgba(30,41,59,.45);font-family:"Chiron GoRound TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#1e293b}',
    '.pl-box{width:100%;max-width:400px;background:#fffdf7;border:2px solid #1e293b;border-radius:18px;box-shadow:5px 5px 0 #1e293b;padding:22px 22px 18px}',
    '.pl-box h2{margin:0 0 6px;font-size:24px;font-weight:900}',
    '.pl-box p{margin:0 0 14px;color:#57534e;font-size:15px;line-height:1.7;font-family:"Iansui","Noto Sans TC",serif}',
    '.pl-box input{width:100%;box-sizing:border-box;font:inherit;font-size:22px;font-weight:700;padding:10px 14px;border:2px solid #1e293b;border-radius:12px;background:#fff;outline:none}',
    '.pl-box input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2)}',
    '.pl-seat{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:15px;font-weight:700;color:#57534e;white-space:nowrap}',
    '.pl-seat input{font-size:18px;padding:8px 12px}',
    '.pl-err{min-height:20px;margin:6px 2px 8px;color:#dc2626;font-size:13px;font-weight:700}',
    '.pl-row{display:flex;gap:10px}',
    '.pl-btn{flex:1;font:inherit;font-size:17px;font-weight:900;padding:11px 14px;border-radius:12px;border:2px solid #1e293b;cursor:pointer;background:#2563eb;color:#fff;box-shadow:3px 3px 0 #1e293b}',
    '.pl-btn.ghost{background:#fff;color:#1e293b;flex:0 0 auto}',
    '.pl-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1e293b}',
    // 開始畫面上的玩家名牌
    '.pl-badge{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:8px 12px;border-radius:12px;background:#fff;border:1.5px solid #e2e8f0;border-left:6px solid var(--pc,#2563eb);font-size:15px}',
    '.pl-badge b{font-size:17px;color:var(--pc,#2563eb)}',
    '.pl-badge button{margin-left:auto;font:inherit;font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px;border:1.5px solid #cbd5e1;background:#f8fafc;color:#475569;cursor:pointer}',
    // 破關證書
    '.pl-cert{position:relative;width:100%;max-width:560px;background:#fffdf7;border-radius:6px;padding:34px 30px 26px;text-align:center;',
    '  box-shadow:0 18px 50px rgba(0,0,0,.3);border:10px double var(--cc)}',
    '.pl-cert::before{content:"";position:absolute;inset:8px;border:1.5px solid color-mix(in srgb,var(--cc) 45%,transparent);pointer-events:none}',
    '.pl-cert .k{font-size:12px;letter-spacing:.5em;padding-left:.5em;color:#a8a29e;font-weight:700}',
    '.pl-cert h2{margin:6px 0 18px;font-size:40px;font-weight:900;letter-spacing:.3em;padding-left:.3em;color:var(--cc)}',
    '.pl-cert .t{font-family:"Iansui","Noto Sans TC",serif;font-size:17px;line-height:1.9;color:#44403c}',
    '.pl-cert .n{display:inline-block;margin:4px 0 10px;padding:0 18px 4px;font-size:36px;font-weight:900;color:#1e293b;border-bottom:3px solid var(--cc)}',
    '.pl-cert .isl{font-size:22px;font-weight:900;color:var(--cc)}',
    '.pl-cert .d{margin-top:18px;font-size:14px;color:#78716c}',
    '.pl-cert .stamp{position:absolute;right:26px;bottom:112px;width:84px;height:84px;border-radius:50%;border:4px solid var(--cc);color:var(--cc);',
    '  display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-14deg);font-weight:900;font-size:13px;opacity:.85;background:rgba(255,255,255,.6)}',
    '.pl-cert .stamp span{font-size:30px;line-height:1.1}',
    '.pl-cert-btns{display:flex;gap:10px;justify-content:center;margin-top:16px}',
    '.pl-cert-btns .pl-btn{flex:0 1 auto;background:var(--cc)}',
    '.pl-cert-btns .pl-btn.ghost{background:#fff}',
    '.pl-cert-tip{margin-top:8px;font-size:12px;color:#a8a29e}',
    '@media (max-width:480px){.pl-cert{padding:26px 16px 20px}.pl-cert h2{font-size:30px}.pl-cert .n{font-size:28px}.pl-cert .stamp{width:64px;height:64px;right:12px;bottom:70px}.pl-cert .stamp span{font-size:22px}}',
    // 列印時只印證書
    '@media print{body>*:not(.pl-print){display:none!important}.pl-print{position:static;background:none;padding:0}.pl-cert{box-shadow:none}.pl-cert-btns,.pl-cert-tip{display:none}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ } }
  // 在輸入框裡打字時，不要讓遊戲收到按鍵（不然打 W、A、S、D 車子會跟著動）
  function shield(el) { ['keydown', 'keyup', 'keypress'].forEach(function (t) { el.addEventListener(t, function (e) { e.stopPropagation(); }); }); }

  // 問名字的視窗；canCancel＝改名時可以取消
  function ask(canCancel, done) {
    var wrap = document.createElement('div');
    wrap.className = 'pl-wrap';
    wrap.innerHTML = '<form class="pl-box" autocomplete="off">' +
      '<h2>' + (canCancel ? '修改名字／班級座號' : '歡迎來到知識群島！') + '</h2>' +
      '<p>' + (canCancel ? '改好之後，五座島都會一起更新。' : '出發前，請先告訴我們你的名字和班級座號。島上的人會用名字稱呼你，破關時也會寫在證書上；班級座號讓老師知道是誰在作答。') + '</p>' +
      '<input type="text" maxlength="' + MAX + '" placeholder="例如：王小明" aria-label="你的名字">' +
      '<label class="pl-seat">班級座號<input type="text" maxlength="10" inputmode="numeric" placeholder="例如：901-05" aria-label="班級座號"></label>' +
      '<div class="pl-err"></div>' +
      '<div class="pl-row">' + (canCancel ? '<button type="button" class="pl-btn ghost">取消</button>' : '') +
      '<button type="submit" class="pl-btn">' + (canCancel ? '確定' : '就是我，出發！') + '</button></div></form>';
    document.body.appendChild(wrap);
    var form = wrap.querySelector('form'), input = wrap.querySelector('input'), err = wrap.querySelector('.pl-err');
    var seatIn = wrap.querySelector('.pl-seat input');
    shield(wrap);
    input.value = data.name || '';
    seatIn.value = data.seat || '';
    setTimeout(function () { input.focus(); input.select(); }, 50);
    var cancel = wrap.querySelector('.pl-btn.ghost');
    if (cancel) cancel.onclick = function () { wrap.remove(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var v = input.value.replace(/\s+/g, ' ').trim();
      if (!v) { err.textContent = '名字一定要填喔！'; input.focus(); return; }
      if (v.length > MAX) { err.textContent = '名字最多 ' + MAX + ' 個字。'; input.focus(); return; }
      var s = seatOf(seatIn.value);
      if (!s) { err.textContent = '班級座號請寫成「班級-座號」，例如 901-05'; seatIn.focus(); return; }
      data.name = v; data.seat = s; save();
      wrap.remove();
      done(v);
    };
  }

  // 班級座號統一寫成「901-05」：全形數字轉半形，中間可以是 - 、空白或不寫（90105）
  function seatOf(v) {
    v = String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
    var m = /^(\d{3,4})\s*[-－—_ ]\s*(\d{1,2})$/.exec(v) || /^(\d{3,4})(\d{2})$/.exec(v);
    if (!m) return '';
    return m[1] + '-' + (m[2].length < 2 ? '0' : '') + m[2];
  }

  function changed() { listeners.forEach(function (cb) { try { cb(data.name); } catch (e) { /* 忽略 */ } }); }

  var asking = false;
  function ensure(cb) {
    if (data.name && data.seat) { if (cb) cb(data.name); return; }    // 以前只填過名字的，也要補填班級座號
    if (cb) waiting.push(cb);
    if (asking) return;
    asking = true;
    var go = function () {
      ask(false, function () {
        asking = false;
        changed();
        var list = waiting; waiting = [];
        list.forEach(function (f) { f(data.name); });
      });
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  function badge(el, opt) {
    if (!el) return;
    opt = opt || {};
    var draw = function () {
      el.className = 'pl-badge';
      if (opt.color) el.style.setProperty('--pc', opt.color);
      var cert = opt.cert && opt.cert();      // 破完這座島才有「證書」按鈕，可以再看一次
      el.innerHTML = '<span>👤 玩家：</span><b>' + esc(data.name || '（還沒填）') + '</b>' + (data.seat ? '<span style="color:#78716c;font-size:13px">' + esc(data.seat) + '</span>' : '') +
        '<button type="button" data-a="name">✎ 改名</button>' + (cert ? '<button type="button" data-a="cert" style="margin-left:0">🏅 證書</button>' : '');
      el.querySelector('[data-a="name"]').onclick = function () { ask(!!data.name, function () { changed(); }); };
      if (cert) el.querySelector('[data-a="cert"]').onclick = function () { certificate(cert); };
    };
    draw();
    listeners.push(draw);
  }

  function certificate(o) {
    var now = new Date();
    var date = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日';
    var wrap = document.createElement('div');
    wrap.className = 'pl-wrap pl-print';
    wrap.innerHTML = '<div class="pl-cert" style="--cc:' + esc(o.color || '#2563eb') + '">' +
      '<div class="k">知 識 群 島　破 關 證 書</div>' +
      '<h2>破關證書</h2>' +
      '<div class="t">茲證明</div>' +
      '<div class="n">' + esc(data.name || '') + '</div>' +
      '<div class="t">完成了<span class="isl">「' + esc(o.island) + '」</span>的全部挑戰<br>' + esc(o.sub || '') +
      (o.line ? '<br>' + esc(o.line) : '') + '</div>' +
      '<div class="d">' + date + '</div>' +
      '<div class="stamp"><span>' + esc(o.icon || '★') + '</span>破關</div>' +
      '<div class="pl-cert-btns"><button type="button" class="pl-btn ghost" data-a="print">🖨 列印／存成 PDF</button><button type="button" class="pl-btn" data-a="ok">收下證書</button></div>' +
      '<div class="pl-cert-tip">也可以截圖交給老師</div></div>';
    document.body.appendChild(wrap);
    shield(wrap);
    wrap.querySelector('[data-a="print"]').onclick = function () { window.print(); };
    wrap.querySelector('[data-a="ok"]').onclick = function () { wrap.remove(); if (o.onClose) o.onClose(); };
  }

  window.Player = {
    get name() { return data.name || ''; },
    get seat() { return data.seat || ''; },
    fill: function (s) { return String(s).replace(/\{name\}/g, data.name || '你'); },
    ensure: ensure,
    badge: badge,
    onChange: function (cb) { listeners.push(cb); },
    refresh: changed,
    certificate: certificate
  };
  // 一打開網頁就先問名字（3D 場景在背後繼續載入）
  ensure();
})();
