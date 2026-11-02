// 知識群島：過橋轉場（物理島和地理島的網頁共用）
// 畫面像一張旅行明信片：米色天空、海面上兩座低多邊形小島，中間一座拱橋，小車從這座島開到那座島。
//   Travel.go({ from, to, sub, color, url })   開到橋尾時呼叫：播完小車過橋，再換到另一座島的網頁
//   Travel.arrive({ to, sub, color })           剛換到新網頁時呼叫：小車停在橋尾，畫面慢慢淡出
(function () {
  var css = [
    '.travel{position:fixed;inset:0;z-index:30;overflow:hidden;opacity:0;transition:opacity .7s ease;pointer-events:none;',
    '  background:linear-gradient(180deg,#fbf6ea 0%,#f8ead2 42%,#f3d9b8 56%);',
    '  font-family:"Noto Serif TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",serif;color:#1e293b}',
    '.travel.show{opacity:1;pointer-events:auto}',
    '.travel.instant{transition:none}',
    // 紙張的細紋理
    '.travel::before{content:"";position:absolute;inset:0;opacity:.35;pointer-events:none;',
    '  background-image:radial-gradient(rgba(120,90,50,.18) 1px,transparent 1.2px);background-size:5px 5px}',
    '.tv-text{position:absolute;left:0;right:0;top:16%;text-align:center;padding:0 16px}',
    '.tv-kicker{font-size:13px;letter-spacing:.8em;padding-left:.8em;color:#a8a29e;opacity:0;animation:tvUp .7s .15s ease forwards}',
    '.tv-name{font-size:clamp(34px,8vw,68px);font-weight:900;letter-spacing:.22em;padding-left:.22em;margin:14px 0 12px;color:var(--c);',
    '  opacity:0;animation:tvUp .8s .3s ease forwards}',
    '.tv-rule{height:2px;width:0;margin:0 auto;background:var(--c);animation:tvRule 1s .55s ease forwards}',
    '.tv-sub{margin-top:12px;font-size:15px;letter-spacing:.3em;padding-left:.3em;color:#57534e;opacity:0;animation:tvUp .8s .7s ease forwards}',
    '.tv-scene{position:absolute;left:0;bottom:0;width:100%;height:52%;overflow:visible}',
    '.tv-wave{animation:tvWave 3.2s linear infinite}',
    '.tv-wave.w2{animation-duration:4.6s;animation-direction:reverse}',
    '.travel.instant .tv-kicker,.travel.instant .tv-name,.travel.instant .tv-sub{animation:none;opacity:1}',
    '.travel.instant .tv-rule{animation:none;width:min(220px,50vw)}',
    '@keyframes tvUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '@keyframes tvRule{to{width:min(220px,50vw)}}',
    '@keyframes tvWave{to{transform:translateX(-120px)}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // 拱橋的曲線（二次貝茲曲線）上的點
  var B = { x0: 260, x1: 940, y: 238, top: 150 };
  function bridgeAt(t) {
    var cx = (B.x0 + B.x1) / 2, cy = 2 * B.top - B.y;
    var u = 1 - t;
    return [u * u * B.x0 + 2 * u * t * cx + t * t * B.x1, u * u * B.y + 2 * u * t * cy + t * t * B.y];
  }
  function waves(y, cls, op) {
    var d = 'M-1320 ' + y;
    for (var x = -1320; x < 2520; x += 120) d += ' q30 -7 60 0 t60 0';
    return '<path class="tv-wave ' + cls + '" d="' + d + '" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="' + op + '"/>';
  }
  // 低多邊形小島：沙灘＋草地＋幾棵三角形的樹＋插一面島的顏色的小旗子
  function island(cx, color, name) {
    var s = '<polygon points="' + (cx - 150) + ',262 ' + (cx - 110) + ',238 ' + (cx - 30) + ',228 ' + (cx + 60) + ',232 ' + (cx + 140) + ',244 ' + (cx + 160) + ',262" fill="#ead6a8"/>' +
      '<polygon points="' + (cx - 120) + ',244 ' + (cx - 80) + ',214 ' + (cx - 10) + ',202 ' + (cx + 70) + ',210 ' + (cx + 125) + ',240" fill="#5a9e5f"/>' +
      '<polygon points="' + (cx - 80) + ',214 ' + (cx - 10) + ',202 ' + (cx + 10) + ',230 ' + (cx - 60) + ',236" fill="#4a8a50"/>';
    [[-60, 1], [-30, 1.3], [40, 1.1]].forEach(function (t) {
      var x = cx + t[0], h = 34 * t[1];
      s += '<polygon points="' + (x - 11 * t[1]) + ',' + (212) + ' ' + x + ',' + (212 - h) + ' ' + (x + 11 * t[1]) + ',212" fill="#2f6f3e"/>';
    });
    s += '<line x1="' + (cx + 82) + '" y1="214" x2="' + (cx + 82) + '" y2="176" stroke="#57534e" stroke-width="3"/>' +
      '<polygon points="' + (cx + 83) + ',177 ' + (cx + 112) + ',184 ' + (cx + 83) + ',192" fill="' + color + '"/>';
    s += '<text x="' + cx + '" y="300" text-anchor="middle" font-size="24" font-weight="700" letter-spacing="4" fill="#fffdf7" opacity=".95">' + name + '</text>';
    return s;
  }
  // 小白車（和遊戲裡的實驗車一樣：白車身、藍條紋、車頂燒杯），原點在車底中央
  var CAR = '<rect x="-26" y="-24" width="52" height="15" rx="4" fill="#fff" stroke="#334155" stroke-width="1.5"/>' +
    '<rect x="-26" y="-17" width="52" height="4" fill="#2563eb"/>' +
    '<rect x="-16" y="-36" width="22" height="13" rx="3" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>' +
    '<rect x="2" y="-33" width="3" height="8" fill="#7dd3fc"/>' +
    '<rect x="-12" y="-46" width="9" height="11" rx="2" fill="#bbf7d0" stroke="#334155" stroke-width="1.2"/>' +
    '<circle cx="-14" cy="-7" r="6.5" fill="#1f2937"/><circle cx="14" cy="-7" r="6.5" fill="#1f2937"/>' +
    '<circle cx="-14" cy="-7" r="2.5" fill="#cbd5e1"/><circle cx="14" cy="-7" r="2.5" fill="#cbd5e1"/>';

  function build(o) {
    var old = document.getElementById('travel'); if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'travel'; el.className = 'travel';
    el.style.setProperty('--c', o.color || '#1e293b');
    // 橋面、欄杆、吊索
    var deck = 'M' + B.x0 + ' ' + B.y + ' Q' + (B.x0 + B.x1) / 2 + ' ' + (2 * B.top - B.y) + ' ' + B.x1 + ' ' + B.y;
    var hangers = '';
    for (var i = 1; i < 12; i++) { var p = bridgeAt(i / 12); hangers += '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[0] + '" y2="' + (p[1] - 16) + '" stroke="#8b5e3c" stroke-width="2.5"/>'; }
    var end = bridgeAt(1);
    var rel = 'M0 0 Q' + (B.x1 - B.x0) / 2 + ' ' + 2 * (B.top - B.y) + ' ' + (B.x1 - B.x0) + ' 0';
    el.innerHTML =
      '<div class="tv-text"><div class="tv-kicker">' + (o.arrive ? '抵 達' : '過 橋 中 · 下 一 站') + '</div>' +
      '<div class="tv-name">' + o.to + '</div><div class="tv-rule"></div>' +
      (o.sub ? '<div class="tv-sub">' + o.sub + '</div>' : '') + '</div>' +
      '<svg class="tv-scene" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax meet">' +
      '<circle cx="600" cy="232" r="88" fill="#fcd9a0" opacity=".75"/>' +
      '<rect x="-3000" y="250" width="7200" height="2000" fill="#7fbfd4"/>' +
      '<rect x="-3000" y="250" width="7200" height="6" fill="#a9dcec"/>' +
      waves(285, '', 0.55) + waves(330, 'w2', 0.4) + waves(372, '', 0.3) +
      island(140, o.fromColor || '#2563eb', o.arrive ? '' : (o.from || '')) +
      island(1060, o.color || '#1e293b', o.arrive ? '' : o.to) +
      '<path d="' + deck + '" transform="translate(0,-16)" fill="none" stroke="#8b5e3c" stroke-width="3"/>' + hangers +
      '<path d="' + deck + '" fill="none" stroke="#7c4a21" stroke-width="9" stroke-linecap="round"/>' +
      // 小車先停在橋頭；animateMotion 的路徑是相對橋頭的位移，開始播放後沿著橋面開過去
      '<g transform="translate(' + (o.arrive ? end[0] : B.x0) + ',' + (B.y - 4) + ')"><g class="tv-car">' + CAR +
      (o.arrive ? '' : '<animateMotion dur="1.5s" begin="indefinite" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .55 1" path="' + rel + '" rotate="auto"/>') +
      '</g>' +
      '</g></svg>';
    document.body.appendChild(el);
    return el;
  }

  window.Travel = {
    go: function (o) {
      var el = build(o);
      var m = el.querySelector('animateMotion');
      el.getBoundingClientRect();                         // 先讓瀏覽器排版，透明度才會有淡入效果
      el.classList.add('show');
      setTimeout(function () { if (m && m.beginElement) m.beginElement(); }, 250);
      setTimeout(function () { location.href = o.url; }, 2000);
    },
    arrive: function (o) {
      o.arrive = true;
      var el = build(o);
      el.classList.add('show', 'instant');
      el.getBoundingClientRect();
      setTimeout(function () { el.classList.remove('instant'); el.classList.remove('show'); }, 700);
      setTimeout(function () { el.remove(); }, 1600);
    }
  };
})();
