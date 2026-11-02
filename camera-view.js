// 知識群島：開車視角（每座島的網頁共用）
// 兩種視角：
//   固定視角：鏡頭固定朝北，畫面像地圖；方向鍵以車頭為準，車子往畫面下方開時，← 會往畫面右邊轉
//   追車視角：鏡頭跟在車子後面，車頭永遠朝畫面上方，← 就是往左轉；畫面會跟著旋轉
// 選擇存在這台電腦的瀏覽器裡（knowledgeIsles.camView），每座島都讀同一份，所以只要選一次。
//   CamView.chase              true＝追車視角
//   CamView.ensure(cb)         還沒選過就先跳出說明動畫讓玩家選，選好再執行 cb；選過就直接執行
//   CamView.open()             再看一次說明動畫、重新選（右上角 🎥 按鈕）
//   CamView.toggle()           直接切換（V 鍵），回傳切換後是不是追車視角
//   CamView.onChange(cb)       視角改變時通知
//   CamView.heading(fwd, dt)   追車鏡頭用：車頭在地面上的方向（平滑過的單位向量 {x, z}）；dt 不給就直接對齊車頭
(function () {
  var KEY = 'knowledgeIsles.camView';
  var mode = '';
  try { mode = localStorage.getItem(KEY) || ''; } catch (e) { /* 無法讀取就當作還沒選 */ }
  var listeners = [];

  var css = [
    '.cv-wrap{position:fixed;inset:0;z-index:61;display:flex;align-items:center;justify-content:center;padding:16px;',
    '  background:rgba(30,41,59,.45);font-family:"Chiron GoRound TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#1e293b}',
    '.cv-box{width:100%;max-width:680px;max-height:calc(100vh - 32px);overflow:auto;background:#fffdf7;border:2px solid #1e293b;border-radius:18px;box-shadow:5px 5px 0 #1e293b;padding:20px 20px 16px}',
    '.cv-box h2{margin:0 0 4px;font-size:24px;font-weight:900}',
    '.cv-box>p{margin:0 0 14px;color:#57534e;font-size:15px;line-height:1.7;font-family:"Iansui","Noto Sans TC",serif}',
    '.cv-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.cv-card{display:flex;flex-direction:column;border:2px solid #e2e8f0;border-radius:14px;padding:10px;background:#fff}',
    '.cv-card.now{border-color:#2563eb}',
    '.cv-card h3{margin:0 0 6px;font-size:18px;font-weight:900;display:flex;align-items:center;gap:6px}',
    '.cv-card h3 small{font-size:12px;font-weight:700;color:#2563eb;border:1.5px solid #2563eb;border-radius:999px;padding:1px 8px}',
    '.cv-card svg{width:100%;aspect-ratio:4/3;display:block;border-radius:10px;border:1.5px solid #1e293b;background:#bfe3a5}',
    '.cv-keys{display:flex;justify-content:center;gap:6px;margin:8px 0 4px}',
    '.cv-keys span{min-width:34px;padding:3px 0;text-align:center;font-weight:900;border:2px solid #cbd5e1;border-bottom-width:4px;border-radius:8px;color:#94a3b8;background:#f8fafc;transition:all .12s}',
    '.cv-keys span.on{border-color:#1e293b;color:#fff;background:#f97316;transform:translateY(2px);border-bottom-width:2px}',
    '.cv-say{min-height:42px;margin:0 0 6px;font-size:13px;line-height:1.6;text-align:center;font-weight:700;color:#475569}',
    '.cv-say b{color:#dc2626}',
    '.cv-card ul{margin:0 0 10px;padding-left:18px;font-size:14px;line-height:1.7;color:#44403c;font-family:"Iansui","Noto Sans TC",serif;flex:1}',
    '.cv-btn{font:inherit;font-size:16px;font-weight:900;padding:10px 12px;border-radius:12px;border:2px solid #1e293b;cursor:pointer;background:#2563eb;color:#fff;box-shadow:3px 3px 0 #1e293b}',
    '.cv-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1e293b}',
    '.cv-tip{margin:12px 0 0;text-align:center;font-size:13px;color:#78716c}',
    '@media (max-width:560px){.cv-grid{grid-template-columns:1fr}.cv-box{padding:16px 14px 12px}.cv-card svg{aspect-ratio:16/9}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- 說明動畫：同一台車在同一張地圖上繞「8」字，兩種鏡頭同時播 ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function pathAt(t) {                         // 地圖座標（y 往下）
    return { x: 34 * Math.sin(t), y: 20 * Math.sin(2 * t) };
  }
  function velAt(t) { return { x: 34 * Math.cos(t), y: 40 * Math.cos(2 * t) }; }
  function accAt(t) { return { x: -34 * Math.sin(t), y: -80 * Math.sin(2 * t) }; }

  function mapSVG() {
    var road = '', i, p;
    for (i = 0; i <= 120; i++) { p = pathAt(i / 120 * Math.PI * 2); road += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
    var trees = [[-58, -30], [-50, 34], [0, -40], [8, 38], [56, -34], [60, 30], [-20, 0], [20, 2], [-70, 4], [72, -2], [-30, -44], [34, 46]];
    var t = trees.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4.5" fill="#4d9b5a"/><circle cx="' + (q[0] - 1.2) + '" cy="' + (q[1] - 1.2) + '" r="1.8" fill="#6fbf73"/>'; }).join('');
    return '<rect x="-150" y="-150" width="300" height="300" fill="#bfe3a5"/>' +
      '<ellipse cx="-44" cy="-6" rx="9" ry="6" fill="#6fc3dc"/>' +
      '<rect x="40" y="-14" width="13" height="10" fill="#fde68a" stroke="#92400e" stroke-width=".8"/><path d="M38.5 -14 L46.5 -20 L54.5 -14Z" fill="#dc2626"/>' +
      '<path d="' + road + '" fill="none" stroke="#94a3b8" stroke-width="9" stroke-linejoin="round"/>' +
      '<path d="' + road + '" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="3 3"/>' + t +
      '<text x="0" y="-27" font-size="7" font-weight="900" text-anchor="middle" fill="#1e293b">實驗站</text>' +
      '<text x="0" y="31" font-size="7" font-weight="900" text-anchor="middle" fill="#1e293b">停車場</text>';
  }
  var CAR = '<rect x="-5" y="-2.8" width="10" height="5.6" rx="1.4" fill="#f97316" stroke="#1e293b" stroke-width=".7"/>' +
    '<rect x="0.6" y="-2.1" width="2.6" height="4.2" rx=".6" fill="#bae6fd"/><circle cx="4.6" cy="-1.6" r=".6" fill="#fef08a"/><circle cx="4.6" cy="1.6" r=".6" fill="#fef08a"/>';

  function demo(svg, chase) {
    svg.setAttribute('viewBox', '-50 -37.5 100 75');
    svg.innerHTML = '<g class="w">' + mapSVG() + (chase ? '' : '<g class="c">' + CAR + '</g>') + '</g>' +
      (chase ? '<g transform="translate(0 20) rotate(-90) scale(1.25)">' + CAR + '</g>' : '') +
      '<g transform="translate(-41 -28)"><circle r="6.5" fill="#fffdf7" stroke="#1e293b" stroke-width=".8"/><g class="n"><path d="M0 -5 L2.2 0 L-2.2 0Z" fill="#dc2626"/><text y="4.6" font-size="4.6" font-weight="900" text-anchor="middle" fill="#1e293b">北</text></g></g>';
    return { w: svg.querySelector('.w'), c: svg.querySelector('.c'), n: svg.querySelector('.n') };
  }

  function chooser(cancelable, done) {
    var wrap = document.createElement('div');
    wrap.className = 'cv-wrap';
    function card(id, title, items) {
      return '<div class="cv-card' + (cancelable && mode === id ? ' now' : '') + '" data-v="' + id + '">' +
        '<h3>' + title + (cancelable && mode === id ? '<small>現在用這個</small>' : '') + '</h3>' +
        '<svg xmlns="' + SVGNS + '" role="img" aria-label="' + title + '的示範動畫"></svg>' +
        '<div class="cv-keys"><span data-k="L">←</span><span data-k="U">↑</span><span data-k="R">→</span></div>' +
        '<div class="cv-say"></div><ul>' + items.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="cv-btn">用' + title + '</button></div>';
    }
    wrap.innerHTML = '<div class="cv-box" role="dialog" aria-modal="true">' +
      '<h2>選一種開車視角</h2>' +
      '<p>兩種視角的按鍵都一樣：↑ 前進、← → 轉彎。差別在「畫面怎麼動」，看看下面的動畫，選一個你覺得好開的。</p>' +
      '<div class="cv-grid">' +
      card('chase', '追車視角', ['鏡頭跟在車子後面，<b>車頭永遠朝上</b>', '按 ← 一定往左轉，像玩賽車遊戲', '畫面會跟著轉，地上的字有時是倒的']) +
      card('fixed', '固定視角', ['鏡頭不動，<b>上方永遠是北方</b>，像看地圖', '車子往下開時，按 ← 會往畫面右邊轉', '畫面不會轉，地上的字都是正的']) +
      '</div><p class="cv-tip">之後隨時可以按右上角 🎥' + (matchMedia('(pointer: coarse)').matches ? '' : ' 或 <b>V</b> 鍵') + ' 換視角。</p></div>';
    document.body.appendChild(wrap);
    // 視窗開著的時候，不要讓遊戲收到按鍵
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { wrap.addEventListener(t, function (e) { if (e.code === 'Escape' && cancelable) close(); e.stopPropagation(); }); });

    var cards = Array.prototype.slice.call(wrap.querySelectorAll('.cv-card')).map(function (el) {
      var chase = el.dataset.v === 'chase';
      return { el: el, chase: chase, d: demo(el.querySelector('svg'), chase), keys: el.querySelectorAll('.cv-keys span'), say: el.querySelector('.cv-say') };
    });
    var raf = 0, t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000 * 0.55 + 0.4;
      var p = pathAt(t), v = velAt(t), a = accAt(t);
      var ang = Math.atan2(v.y, v.x) * 180 / Math.PI;                 // 車頭方向（度，畫面座標）
      var turn = (v.x * a.y - v.y * a.x) / Math.pow(v.x * v.x + v.y * v.y, 1.5) * 40;   // >0 右轉、<0 左轉
      var key = turn > 0.35 ? 'R' : turn < -0.35 ? 'L' : 'U';
      var s = Math.sin(ang * Math.PI / 180), down = s > 0.45, up = s < -0.45;   // 車頭朝畫面下方／上方
      cards.forEach(function (c) {
        if (c.chase) {
          var r = -ang - 90;
          c.d.w.setAttribute('transform', 'translate(0 20) rotate(' + r.toFixed(2) + ') translate(' + (-p.x).toFixed(2) + ' ' + (-p.y).toFixed(2) + ')');
          c.d.n.setAttribute('transform', 'rotate(' + r.toFixed(2) + ')');
          c.say.innerHTML = key === 'L' ? '按 ←：車子往<b>畫面左邊</b>轉' : key === 'R' ? '按 →：車子往<b>畫面右邊</b>轉' : '按 ↑：往前開（車頭朝上）';
        } else {
          c.d.c.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ') rotate(' + ang.toFixed(2) + ')');
          var k = key === 'L' ? '←' : '→';
          c.say.innerHTML = key === 'U' ? '按 ↑：往車頭的方向開' + (down ? '（現在車頭朝下）' : '') :
            down ? '按 ' + k + '：車子卻往<b>畫面' + (key === 'L' ? '右' : '左') + '邊</b>轉<br>（車頭朝下，左右相反）' :
            up ? '按 ' + k + '：車子往畫面' + (key === 'L' ? '左' : '右') + '邊轉' :
            '按 ' + k + '：往車頭的' + (key === 'L' ? '左' : '右') + '手邊轉';
        }
        Array.prototype.forEach.call(c.keys, function (k) { k.classList.toggle('on', k.dataset.k === key); });
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function close() { cancelAnimationFrame(raf); wrap.remove(); }
    cards.forEach(function (c) {
      c.el.querySelector('.cv-btn').onclick = function () { close(); set(c.chase ? 'chase' : 'fixed'); if (done) done(); };
    });
    if (cancelable) wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    setTimeout(function () { var b = wrap.querySelector('.cv-btn'); if (b) b.focus(); }, 50);
  }

  function set(m) {
    var was = mode;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (e) { /* 忽略 */ }
    if (was !== m) { heading.yaw = null; listeners.forEach(function (cb) { try { cb(m === 'chase'); } catch (e) { /* 忽略 */ } }); }
  }

  // 追車鏡頭的方向：車頭在地面上的角度，平滑地轉過去（轉彎時畫面不會甩）；車子翻覆、直立時沿用上一個方向
  function heading(fwd, dt) {
    var l = Math.hypot(fwd.x, fwd.z);
    var want = l > 0.3 ? Math.atan2(fwd.x, fwd.z) : heading.yaw;
    if (want == null) want = Math.PI;               // 還沒有方向：朝北（-z）
    if (heading.yaw == null || dt == null) heading.yaw = want;
    else {
      var d = want - heading.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));      // 走比較短的那一邊
      heading.yaw += d * (1 - Math.exp(-dt * 3));
    }
    return { x: Math.sin(heading.yaw), z: Math.cos(heading.yaw) };
  }
  heading.yaw = null;

  window.CamView = {
    get chase() { return mode === 'chase'; },
    ensure: function (cb) { if (mode) cb(); else chooser(false, cb); },
    open: function () { chooser(true); },
    toggle: function () { set(mode === 'chase' ? 'fixed' : 'chase'); return mode === 'chase'; },
    onChange: function (cb) { listeners.push(cb); },
    heading: heading
  };
})();
