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
// 操作教學：選完視角後，在小地圖上試開，每個按鍵試過就打勾（看過一次就記在 knowledgeIsles.tourSeen）
//   Controls.ensure(items, opts, cb)   還沒看過就先開教學，按「開始開車！」後執行 cb；看過就直接執行
//   Controls.open(items, opts)         再看一次（說明視窗裡的「🎮 操作教學」按鈕）
//   items：這座島有的操作，例如 ['up','down','left','right','brake','enter','horn','lights','reset','view']；opts 可以換文字，例如 { reset: '回到郵局', pad: '時光機' }
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

  function mapSVG(bare) {                      // bare＝不要「實驗站／停車場」字樣（操作教學另外畫）
    var road = '', i, p;
    for (i = 0; i <= 120; i++) { p = pathAt(i / 120 * Math.PI * 2); road += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
    var trees = [[-58, -30], [-50, 34], [0, -40], [8, 38], [56, -34], [60, 30], [-20, 0], [20, 2], [-70, 4], [72, -2], [-30, -44], [34, 46]];
    var t = trees.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4.5" fill="#4d9b5a"/><circle cx="' + (q[0] - 1.2) + '" cy="' + (q[1] - 1.2) + '" r="1.8" fill="#6fbf73"/>'; }).join('');
    return '<rect x="-150" y="-150" width="300" height="300" fill="#bfe3a5"/>' +
      '<ellipse cx="-44" cy="-6" rx="9" ry="6" fill="#6fc3dc"/>' +
      '<rect x="40" y="-14" width="13" height="10" fill="#fde68a" stroke="#92400e" stroke-width=".8"/><path d="M38.5 -14 L46.5 -20 L54.5 -14Z" fill="#dc2626"/>' +
      '<path d="' + road + '" fill="none" stroke="#94a3b8" stroke-width="9" stroke-linejoin="round"/>' +
      '<path d="' + road + '" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="3 3"/>' + t + (bare ? '' :
      '<text x="0" y="-27" font-size="7" font-weight="900" text-anchor="middle" fill="#1e293b">實驗站</text>' +
      '<text x="0" y="31" font-size="7" font-weight="900" text-anchor="middle" fill="#1e293b">停車場</text>');
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

  // ---------- 操作教學：在小地圖上試開，每個按鍵試過就打勾 ----------
  // 每座島傳自己有的按鍵（id 見 ACTS），文字不同的可以用 opts 換掉，例如 { reset: '回到郵局', pad: '時光機' }
  var TOUR = 'knowledgeIsles.tourSeen';
  var ACTS = {
    up:     { codes: ['ArrowUp', 'KeyW'], cap: '↑', label: '前進', hold: 1 },
    down:   { codes: ['ArrowDown', 'KeyS'], cap: '↓', label: '倒車', hold: 1 },
    left:   { codes: ['ArrowLeft', 'KeyA'], cap: '←', label: '左轉', hold: 1 },
    right:  { codes: ['ArrowRight', 'KeyD'], cap: '→', label: '右轉', hold: 1 },
    joy:    { codes: [], cap: '搖桿', label: '推搖桿開車', touch: 1 },
    boost:  { codes: ['ShiftLeft', 'ShiftRight'], cap: 'Shift', label: '按住加速', hold: 1 },
    brake:  { codes: ['Space'], cap: '空白鍵', label: '煞車', hold: 1, touch: '煞車' },
    enter:  { codes: ['Enter', 'NumpadEnter'], cap: 'Enter', label: '進入實驗站', touch: '進站' },
    horn:   { codes: ['KeyH'], cap: 'H', label: '喇叭', touch: '喇叭' },
    lights: { codes: ['KeyL'], cap: 'L', label: '車燈', touch: '車燈' },
    reset:  { codes: ['KeyR'], cap: 'R', label: '回到起點', touch: '↺' },
    nav:    { codes: ['KeyN'], cap: 'N', label: '選島導航', touch: '🧭' },
    view:   { codes: ['KeyV'], cap: 'V', label: '換視角', touch: '🎥' },
    rhythm: { codes: ['KeyF', 'KeyJ'], cap: 'F／J', label: '跺腳／拍手' }
  };
  var SAY = {
    up: '↑ 往車頭的方向開', down: '↓ 倒車（車子往後退）', left: '← 方向盤往左打', right: '→ 方向盤往右打', joy: '🕹️ 搖桿往上推前進、往下推倒車，左右推轉彎',
    boost: '💨 按住 Shift 加速，車尾會冒煙；放開就恢復', brake: '✋ 煞車：車子很快停下來', horn: '📯 叭叭！按喇叭',
    lightsOn: '💡 車燈打開了：晚上天會變黑，要開車燈才看得清楚', lightsOff: '💡 車燈關掉了',
    reset: '↺ 車子回到起點：卡住或翻車時很好用', nav: '🧭 地上出現箭頭帶路，跟著箭頭開！',
    enterOk: '🎉 進站成功！遊戲裡會打開這一站的畫面', enterNo: '要先開到發光的圓圈上，才能進站喔', rhythm: '🥁 F 跺腳、👏 J 拍手：節奏遊戲會用到'
  };
  css = [
    '.ct-box{max-width:560px}',
    '.ct-stage{position:relative}',
    '.ct-stage svg{width:100%;height:min(34vh,300px);display:block;border-radius:12px;border:2px solid #1e293b;background:#bfe3a5;touch-action:none}',
    '.ct-view{position:absolute;right:8px;top:8px;font-size:12px;font-weight:900;padding:2px 10px;border-radius:999px;background:#fffdf7;border:1.5px solid #1e293b}',
    '.ct-prompt{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);font:inherit;font-size:14px;font-weight:900;padding:6px 14px;border-radius:999px;border:2px solid #1e293b;background:#fde047;cursor:pointer;white-space:nowrap}',
    '.ct-say{min-height:24px;margin:8px 0;text-align:center;font-size:15px;font-weight:900;color:#1e293b}',
    '.ct-keys{display:flex;gap:14px;justify-content:center;align-items:center}',
    '.ct-arrows{display:grid;grid-template-columns:repeat(3,52px);gap:4px;flex:0 0 auto}',
    '.ct-arrows [data-a=up]{grid-area:1/2}.ct-arrows [data-a=left]{grid-area:2/1}.ct-arrows [data-a=down]{grid-area:2/2}.ct-arrows [data-a=right]{grid-area:2/3}',
    '.ct-others{display:flex;flex-wrap:wrap;gap:10px 8px;justify-content:center}',
    '@media (max-width:520px){.ct-keys{flex-direction:column}}',
    '.ct-cap{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:52px;padding:6px 8px 4px;font:inherit;cursor:pointer;',
    '  border:2px solid #1e293b;border-bottom-width:5px;border-radius:10px;background:#fff;color:#1e293b;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.ct-cap kbd{font:inherit;font-size:17px;font-weight:900;line-height:1.1}',
    '.ct-cap span{font-size:11px;font-weight:700;color:#57534e;white-space:nowrap}',
    '.ct-cap.on{background:#f97316;color:#fff;transform:translateY(3px);border-bottom-width:2px}',
    '.ct-cap.on span{color:#fff}',
    '.ct-cap.done::after{content:"✓";position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;font-weight:900;line-height:18px;text-align:center}',
    '.ct-joy{position:relative;width:96px;height:96px;border-radius:50%;background:#f1f5f9;border:2px solid #1e293b;touch-action:none;flex:0 0 auto}',
    '.ct-joy i{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#2563eb;border:2px solid #1e293b}',
    '.ct-joy.done::after{content:"✓";position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:#16a34a;color:#fff;font-size:13px;font-weight:900;line-height:20px;text-align:center}',
    '.ct-foot{display:flex;align-items:center;gap:10px;margin-top:14px}',
    '.ct-foot .ct-count{flex:1;font-size:14px;font-weight:700;color:#57534e}',
    '.cv-btn.ghost{background:#fff;color:#1e293b}'
  ].join('\n');
  st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function tour(items, opts, done) {
    opts = opts || {};
    var touch = matchMedia('(pointer: coarse)').matches;
    var ids = [];
    items.forEach(function (id) {
      var a = ACTS[id];
      if (!a) return;
      if (touch && /^(up|down|left|right)$/.test(id)) { if (ids.indexOf('joy') < 0) ids.push('joy'); return; }
      if (touch ? a.touch : id !== 'joy') ids.push(id);
    });
    function label(id) { return opts[id] || ACTS[id].label; }
    function capHTML(id) {
      var cap = touch ? ACTS[id].touch : ACTS[id].cap;
      return '<button type="button" class="ct-cap" data-a="' + id + '"><kbd>' + cap + '</kbd>' + (cap === label(id) ? '' : '<span>' + label(id) + '</span>') + '</button>';
    }
    var arrows = ids.filter(function (id) { return /^(up|down|left|right)$/.test(id); });
    // 觸控版和遊戲一樣：開到圓圈上會出現提示，點提示進站，所以不另外放「進站」按鈕
    var others = ids.filter(function (id) { return arrows.indexOf(id) < 0 && id !== 'joy' && !(touch && id === 'enter'); });
    var wrap = document.createElement('div');
    wrap.className = 'cv-wrap';
    wrap.innerHTML = '<div class="cv-box ct-box" role="dialog" aria-modal="true">' +
      '<h2>試試看怎麼開車！</h2>' +
      '<p>' + (touch ? '用下面的搖桿和按鈕開開看，小車會跟著動。' : '按鍵盤上的鍵（或用滑鼠按住下面的鍵帽），小車會跟著動。') + '試過的會打勾 ✓，都試完再出發吧！</p>' +
      '<div class="ct-stage"><svg xmlns="' + SVGNS + '" viewBox="-50 -37.5 100 75" role="img" aria-label="試開的小地圖"></svg>' +
      '<div class="ct-view"></div><button type="button" class="ct-prompt" hidden></button></div>' +
      '<div class="ct-say">　</div>' +
      '<div class="ct-keys">' + (ids.indexOf('joy') >= 0 ? '<div class="ct-joy" data-a="joy"><i></i></div>' : '') +
      (arrows.length ? '<div class="ct-arrows">' + ['up', 'left', 'down', 'right'].filter(function (id) { return arrows.indexOf(id) >= 0; }).map(capHTML).join('') + '</div>' : '') +
      '<div class="ct-others">' + others.map(capHTML).join('') + '</div></div>' +
      '<div class="ct-foot"><span class="ct-count"></span><button type="button" class="cv-btn">開始開車！</button></div></div>';
    document.body.appendChild(wrap);

    var svg = wrap.querySelector('svg'), say = wrap.querySelector('.ct-say'), view = wrap.querySelector('.ct-view');
    var prompt = wrap.querySelector('.ct-prompt'), count = wrap.querySelector('.ct-count');
    var PAD = { x: 0, y: -28 }, START = { x: -30, y: 26, a: -Math.PI / 2 };
    svg.innerHTML = '<g class="w">' + mapSVG(true) +
      '<circle class="pad" cx="' + PAD.x + '" cy="' + PAD.y + '" r="5.5" fill="#fde047" fill-opacity=".55" stroke="#f59e0b" stroke-width="1.2"/>' +
      '<text x="' + PAD.x + '" y="' + (PAD.y + 11) + '" font-size="5.5" font-weight="900" text-anchor="middle" fill="#1e293b">' + (opts.pad || '實驗站') + '</text>' +
      '<text x="' + START.x + '" y="' + (START.y + 9.5) + '" font-size="5" font-weight="900" text-anchor="middle" fill="#1e293b">起點</text>' +
      '<g class="sk"></g><rect class="dark" x="-150" y="-150" width="300" height="300" fill="#0f172a" opacity="0"/><g class="fx"></g><g class="nv"></g></g>' +
      '<g class="car"><path class="beam" d="M5 -2 L24 -9 L24 9 L5 2Z" fill="#fef9c3" opacity="0"/>' + CAR + '</g>' +
      '<g class="bub" opacity="0"><rect x="-11" y="-5" width="22" height="8" rx="3" fill="#fff" stroke="#1e293b" stroke-width=".6"/><text y="1" font-size="5" font-weight="900" text-anchor="middle" fill="#1e293b"></text></g>';
    var W = svg.querySelector('.w'), carG = svg.querySelector('.car'), beam = svg.querySelector('.beam'), dark = svg.querySelector('.dark');
    var skG = svg.querySelector('.sk'), fxG = svg.querySelector('.fx'), nvG = svg.querySelector('.nv'), padC = svg.querySelector('.pad');
    var bub = svg.querySelector('.bub'), bubT = bub.querySelector('text');

    var car = { x: START.x, y: START.y, a: START.a, v: 0 }, lights = false, chase = mode === 'chase';
    var held = {}, joy = { x: 0, y: 0 }, tried = {}, smoke = [], skids = [], bubT0 = -9, navT = 0, padT = 0;
    function mark(id) {
      if (tried[id] || ids.indexOf(id) < 0) return;
      tried[id] = 1;
      var el = wrap.querySelector('[data-a="' + id + '"]'); if (el) el.classList.add('done');
      var n = Object.keys(tried).length;
      count.textContent = '已經試了 ' + n + '／' + ids.length + ' 個' + (n === ids.length ? '，全部完成！🎉' : '');
    }
    count.textContent = '已經試了 0／' + ids.length + ' 個';
    function bubble(text) { bubT.textContent = text; bubT0 = performance.now(); }
    function onPad() { return Math.hypot(car.x - PAD.x, car.y - PAD.y) < 6.5; }
    function setView() { view.textContent = chase ? '🎥 追車視角' : '🗺️ 固定視角'; }
    setView();

    function press(id, repeat) {
      var a = ACTS[id];
      if (a.hold) { held[id] = 1; setCap(id, true); }
      if (repeat) return;
      if (id === 'up' || id === 'down' || id === 'left' || id === 'right' || id === 'boost' || id === 'brake') { say.textContent = SAY[id]; return; }
      flash(id);
      if (id === 'horn') { bubble('叭叭！'); say.textContent = SAY.horn; mark(id); }
      else if (id === 'lights') { lights = !lights; say.textContent = lights ? SAY.lightsOn : SAY.lightsOff; mark(id); }
      else if (id === 'reset') { car.x = START.x; car.y = START.y; car.a = START.a; car.v = 0; bubble('咻！'); say.textContent = SAY.reset; mark(id); }
      else if (id === 'nav') { navT = 4; say.textContent = SAY.nav; mark(id); }
      else if (id === 'view') { chase = !chase; set(chase ? 'chase' : 'fixed'); setView(); say.textContent = chase ? '🎥 追車視角：鏡頭跟在車子後面，← 就是往左轉' : '🗺️ 固定視角：上方永遠是北方'; mark(id); }
      else if (id === 'rhythm') { bubble(Math.random() < 0.5 ? '咚！' : '啪！'); say.textContent = SAY.rhythm; mark(id); }
      else if (id === 'enter') {
        if (onPad()) { padT = 1.2; car.v = 0; bubble('進站！'); say.textContent = SAY.enterOk; mark(id); }
        else say.textContent = SAY.enterNo + (ids.indexOf('nav') >= 0 ? (touch ? '（點 🧭 會有箭頭帶路）' : '（按 N 會有箭頭帶路）') : '');
      }
    }
    function release(id) { if (held[id]) { held[id] = 0; setCap(id, false); } }
    function setCap(id, on) { var el = wrap.querySelector('.ct-cap[data-a="' + id + '"]'); if (el) el.classList.toggle('on', on); }
    function flash(id) { setCap(id, true); setTimeout(function () { if (!held[id]) setCap(id, false); }, 160); }

    // 鍵盤：視窗開著時，按鍵都留在教學裡，不會傳到遊戲
    var codeOf = {};
    ids.forEach(function (id) { ACTS[id].codes.forEach(function (c) { codeOf[c] = id; }); });
    function onKey(e) {
      e.stopPropagation();
      var id = codeOf[e.code];
      if (!id) return;
      e.preventDefault();
      if (e.type === 'keydown') press(id, e.repeat); else release(id);
    }
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKey, true);
    // 用滑鼠或手指按住鍵帽、按鈕
    Array.prototype.forEach.call(wrap.querySelectorAll('.ct-cap'), function (el) {
      var id = el.dataset.a;
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.setPointerCapture(e.pointerId); press(id); });
      ['pointerup', 'pointercancel'].forEach(function (t) { el.addEventListener(t, function () { release(id); }); });
    });
    prompt.onclick = function () { press('enter'); };
    // 觸控搖桿（和遊戲裡的一樣：往上推前進、左右推轉彎）
    var pad = wrap.querySelector('.ct-joy');
    if (pad) {
      var knob = pad.querySelector('i'), pid = null;
      var move = function (e) {
        var r = pad.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2), l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        joy.x = dx; joy.y = -dy;
        knob.style.transform = 'translate(' + dx * 28 + 'px,' + dy * 28 + 'px)';
        if (l > 0.4) { mark('joy'); say.textContent = SAY.joy; }
      };
      pad.addEventListener('pointerdown', function (e) { pid = e.pointerId; pad.setPointerCapture(pid); move(e); });
      pad.addEventListener('pointermove', function (e) { if (e.pointerId === pid) move(e); });
      ['pointerup', 'pointercancel'].forEach(function (t) { pad.addEventListener(t, function (e) { if (e.pointerId !== pid) return; pid = null; joy.x = joy.y = 0; knob.style.transform = ''; }); });
    }

    // 小車的動作：簡化的開車（和遊戲一樣以車頭為準轉彎，倒車時方向相反）
    var raf = 0, last = performance.now(), driven = {};
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var th = (held.up ? 1 : 0) - (held.down ? 1 : 0) + joy.y, steer = (held.right ? 1 : 0) - (held.left ? 1 : 0) + joy.x;
      th = Math.max(-1, Math.min(1, th)); steer = Math.max(-1, Math.min(1, steer));
      var boost = held.boost && th > 0, top = boost ? 42 : 24;
      if (held.brake) car.v *= Math.exp(-dt * 7);
      else if (th) car.v += th * (boost ? 60 : 36) * dt;
      else car.v *= Math.exp(-dt * 1.5);
      car.v = Math.max(-12, Math.min(top, car.v));
      if (!boost && car.v > 24) car.v = Math.max(24, car.v - 40 * dt);
      car.a += steer * 2.6 * dt * Math.max(-1, Math.min(1, car.v / 12));
      car.x += Math.cos(car.a) * car.v * dt; car.y += Math.sin(car.a) * car.v * dt;
      if (Math.abs(car.x) > 46 || Math.abs(car.y) > 33) { car.x = Math.max(-46, Math.min(46, car.x)); car.y = Math.max(-33, Math.min(33, car.y)); car.v *= -0.3; }
      // 開過一小段才算試過：↑↓ 要真的有在動、←→ 要真的有轉
      if (held.up && car.v > 4) driven.up = (driven.up || 0) + dt;
      if (held.down && car.v < -2) driven.down = (driven.down || 0) + dt;
      if (held.left && Math.abs(car.v) > 2) driven.left = (driven.left || 0) + dt;
      if (held.right && Math.abs(car.v) > 2) driven.right = (driven.right || 0) + dt;
      if (held.boost && car.v > 25) driven.boost = (driven.boost || 0) + dt;
      if (held.brake && Math.abs(car.v) < 1 && driven.moved) driven.brake = 1;
      if (Math.abs(car.v) > 8) driven.moved = 1;
      ['up', 'down', 'left', 'right', 'boost'].forEach(function (id) { if (driven[id] > 0.3) mark(id); });
      if (driven.brake) mark('brake');
      if (held.left || held.right) {
        if (Math.abs(car.v) < 1 && !held.up && !held.down && !joy.y) say.textContent = '轉彎要邊開邊轉：同時按住 ↑ 和 ' + (held.left ? '←' : '→');
      }
      // 加速冒煙、煞車留下胎痕
      var cx = Math.cos(car.a), cy = Math.sin(car.a);
      if (boost && car.v > 10 && Math.random() < 0.6) smoke.push({ x: car.x - cx * 6, y: car.y - cy * 6, t: 0 });
      if (held.brake && Math.abs(car.v) > 4) skids.push(car.x - cx * 3.5 - cy * 2, car.y - cy * 3.5 + cx * 2, car.x - cx * 3.5 + cy * 2, car.y - cy * 3.5 - cx * 2);
      if (skids.length > 480) skids.splice(0, skids.length - 480);
      smoke = smoke.filter(function (p) { p.t += dt; return p.t < 0.8; });
      skG.innerHTML = skids.reduce(function (s, v, i) { return i % 2 ? s : s + '<circle cx="' + v.toFixed(1) + '" cy="' + skids[i + 1].toFixed(1) + '" r=".7" fill="#334155" opacity=".55"/>'; }, '');
      fxG.innerHTML = smoke.map(function (p) { return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (1.2 + p.t * 4).toFixed(1) + '" fill="#94a3b8" opacity="' + (0.7 * (1 - p.t / 0.8)).toFixed(2) + '"/>'; }).join('');
      // 導航箭頭：從車子指向發光圓圈
      navT = Math.max(0, navT - dt);
      if (navT > 0 && !onPad()) {
        var dx = PAD.x - car.x, dy = PAD.y - car.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        var sx = car.x + ux * 7, sy = car.y + uy * 7, ex = car.x + ux * Math.min(l - 6, 20), ey = car.y + uy * Math.min(l - 6, 20);
        nvG.innerHTML = '<line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M' + (ex + ux * 3).toFixed(1) + ' ' + (ey + uy * 3).toFixed(1) + ' L' + (ex - uy * 3).toFixed(1) + ' ' + (ey + ux * 3).toFixed(1) + ' L' + (ex + uy * 3).toFixed(1) + ' ' + (ey - ux * 3).toFixed(1) + 'Z" fill="#2563eb"/>';
      } else nvG.innerHTML = '';
      // 發光圓圈：在上面時顯示「進站」提示；進站成功時閃一下
      padT = Math.max(0, padT - dt);
      padC.setAttribute('r', (5.5 + Math.sin(now / 250) * 0.6 + padT * 3).toFixed(2));
      var here = onPad() && ids.indexOf('enter') >= 0;
      prompt.hidden = !here;
      if (here) prompt.textContent = touch ? '👆 點這裡進入' + (opts.pad || '實驗站') : '在' + (opts.pad || '實驗站') + '上了！按 Enter 進入';
      dark.setAttribute('opacity', lights ? 0.45 : 0);
      beam.setAttribute('opacity', lights ? 0.75 : 0);
      // 鏡頭：固定視角地圖不動、車子在動；追車視角車子固定在下方、地圖跟著轉
      var deg = car.a * 180 / Math.PI, bx, by;
      if (chase) {
        W.setAttribute('transform', 'translate(0 20) rotate(' + (-deg - 90).toFixed(2) + ') translate(' + (-car.x).toFixed(2) + ' ' + (-car.y).toFixed(2) + ')');
        carG.setAttribute('transform', 'translate(0 20) rotate(-90)');
        bx = 0; by = 11;
      } else {
        W.removeAttribute('transform');
        carG.setAttribute('transform', 'translate(' + car.x.toFixed(2) + ' ' + car.y.toFixed(2) + ') rotate(' + deg.toFixed(2) + ')');
        bx = car.x; by = car.y - 9;
      }
      var age = (now - bubT0) / 1000;
      bub.setAttribute('opacity', age < 0.9 ? 1 : 0);
      bub.setAttribute('transform', 'translate(' + bx.toFixed(1) + ' ' + (by - age * 3).toFixed(1) + ')');
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function close() {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true);
      removeEventListener('keyup', onKey, true);
      wrap.remove();
      try { localStorage.setItem(TOUR, '1'); } catch (e) { /* 忽略 */ }
      if (done) done();
    }
    wrap.querySelector('.ct-foot .cv-btn').onclick = close;
  }

  window.Controls = {
    // 還沒看過操作教學就先看，看完（按「開始開車！」）再執行 cb；看過就直接執行
    ensure: function (items, opts, cb) {
      var seen = false;
      try { seen = !!localStorage.getItem(TOUR); } catch (e) { /* 忽略 */ }
      if (seen) cb(); else tour(items, opts, cb);
    },
    open: function (items, opts, cb) { tour(items, opts, cb); }
  };

  window.CamView = {
    get chase() { return mode === 'chase'; },
    ensure: function (cb) { if (mode) cb(); else chooser(false, cb); },
    open: function () { chooser(true); },
    toggle: function () { set(mode === 'chase' ? 'fixed' : 'chase'); return mode === 'chase'; },
    onChange: function (cb) { listeners.push(cb); },
    heading: heading
  };
})();
