/**
 * 大盘云图 - 侧边栏 WebviewView + 全屏面板
 * 使用 Treemap + Canvas 渲染 A 股热力图
 */

const vscode = require("vscode");
const { fetchHeatmapData, getCachedHeatmapData } = require("../services/heatmapService");
const { isTradingTime } = require("../utils/tradingTime");

class HeatmapProvider {
  constructor() {
    this._view = null;
    this._panel = null;
    this._refreshTimer = null;
  }

  /**
   * 实现 WebviewViewProvider 接口
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "ready" || msg.command === "refresh") {
        this._sendData(webviewView.webview);
      } else if (msg.command === "fullscreen") {
        this._openFullscreen();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendData(webviewView.webview);
      }
    });

    this._startAutoRefresh();
  }

  /**
   * 打开全屏面板（命令面板或按钮触发）
   */
  show() {
    this._openFullscreen();
  }

  _openFullscreen() {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      "codetraderHeatmapFull",
      "大盘云图",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "ready" || msg.command === "refresh") {
        this._sendData(this._panel.webview);
      }
    });

    this._panel.onDidDispose(() => {
      this._panel = null;
    });
  }

  async _sendData(webview) {
    try {
      // Show cached data instantly
      const cached = getCachedHeatmapData();
      if (cached) {
        webview.postMessage({ command: "update", data: cached });
      }

      // Fetch fresh data
      const data = await fetchHeatmapData();
      if (data !== cached) {
        webview.postMessage({ command: "update", data: data });
      }
    } catch (e) {
      console.error("[Heatmap] send data error:", e.message);
    }
  }

  _startAutoRefresh() {
    this._stopAutoRefresh();
    this._refreshTimer = setInterval(() => {
      if (isTradingTime()) {
        if (this._view && this._view.visible) {
          this._sendData(this._view.webview);
        }
        if (this._panel) {
          this._sendData(this._panel.webview);
        }
      }
    }, 10000);
  }

  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  dispose() {
    this._stopAutoRefresh();
    if (this._panel) {
      this._panel.dispose();
      this._panel = null;
    }
  }

  _getHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>大盘云图</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%;
  background: var(--vscode-editor-background, #1e1e2e);
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif);
  overflow: hidden;
  color: var(--vscode-editor-foreground, #cdd6f4);
}
#app {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
}
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 8px;
  background: var(--vscode-sideBar-background, #181825);
  border-bottom: 1px solid var(--vscode-panel-border, #313244);
  flex-shrink: 0;
  min-height: 28px;
}
.toolbar .left { display: flex; align-items: center; gap: 8px; }
.toolbar .stats { font-size: 10px; opacity: 0.7; }
.toolbar .right { display: flex; align-items: center; gap: 4px; }
.btn {
  background: var(--vscode-button-secondaryBackground, #313244);
  border: 1px solid var(--vscode-button-secondaryBorder, #45475a);
  color: var(--vscode-button-secondaryForeground, #cdd6f4);
  font-size: 11px;
  padding: 2px 8px; border-radius: 3px; cursor: pointer;
  transition: all 0.15s;
}
.btn:hover {
  background: var(--vscode-button-secondaryHoverBackground, #45475a);
}

.legend {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 18px;
  background: var(--vscode-sideBar-background, #181825);
  border-bottom: 1px solid var(--vscode-panel-border, #313244);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.legend-title {
  font-size: 13px; font-weight: 600; opacity: 0.9;
  white-space: nowrap;
}
.legend-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; opacity: 0.7;
}
.legend-emoji { font-size: 13px; }

#canvas-wrap {
  flex: 1; position: relative; overflow: hidden;
}
canvas {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
}
#tooltip {
  display: none; position: absolute;
  background: var(--vscode-editorWidget-background, rgba(30, 30, 46, 0.96));
  border: 1px solid var(--vscode-editorWidget-border, #45475a);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 11px;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  white-space: nowrap;
}
#tooltip .tt-name { font-weight: 600; margin-bottom: 4px; font-size: 12px; }
#tooltip .tt-row { display: flex; justify-content: space-between; gap: 16px; line-height: 1.6; }
#tooltip .tt-label { opacity: 0.5; }
#tooltip .tt-val { font-weight: 500; }
.up { color: #f38ba8; }
.down { color: #a6e3a1; }
.flat { color: #9399b2; }

.loading {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 13px; opacity: 0.5;
}
.loading::after {
  content: ''; display: inline-block;
  width: 14px; height: 14px; margin-left: 8px;
  border: 2px solid rgba(128,128,128,0.2);
  border-top-color: #f38ba8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="app">
  <div class="toolbar">
    <div class="left">
      <span class="stats" id="stats"></span>
    </div>
    <div class="right">
      <button class="btn" id="btn-fullscreen" title="全屏查看">⛶</button>
      <button class="btn" id="btn-refresh">↻ 刷新</button>
    </div>
  </div>
  <div class="legend">
    <span class="legend-title">A 股个股热力图</span>
    <span class="legend-item"><span class="legend-emoji">📐</span> 矩形大小 = 总市值</span>
    <span class="legend-item"><span class="legend-emoji">🎨</span> 颜色深浅 = 涨跌幅</span>
  </div>
  <div id="canvas-wrap">
    <canvas id="heatmap"></canvas>
    <div id="tooltip"></div>
    <div class="loading" id="loading">正在加载行情数据</div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ===== Squarify Treemap =====
const Treemap = (() => {
  function squarify(parent, x0, y0, x1, y1) {
    const nodes = parent.children;
    if (!nodes || !nodes.length) return;
    const totalValue = nodes.reduce((s, n) => s + n.value, 0);
    if (totalValue <= 0) return;
    const area = (x1 - x0) * (y1 - y0);
    let remaining = [...nodes];
    let row = [];
    let rowSum = 0;
    while (remaining.length > 0) {
      const w = Math.min(x1 - x0, y1 - y0);
      if (w <= 0) break;
      const node = remaining[0];
      const nodeArea = (node.value / totalValue) * area;
      row.push({ node, area: nodeArea });
      rowSum += nodeArea;
      if (row.length === 1) { remaining.shift(); continue; }
      const prev = worst(row.slice(0, -1), rowSum - nodeArea, w);
      const curr = worst(row, rowSum, w);
      if (curr > prev) {
        row.pop(); rowSum -= nodeArea;
        flush(row, rowSum, x0, y0, x1, y1);
        const W2 = x1-x0, H2 = y1-y0, tall2 = H2 > W2;
        if (tall2) { y0 += W2 > 0 ? rowSum / W2 : 0; }
        else { x0 += H2 > 0 ? rowSum / H2 : 0; }
        row = []; rowSum = 0;
      } else { remaining.shift(); }
    }
    if (row.length) flushLast(row, x0, y0, x1, y1);
  }
  function worst(row, sum, w) {
    if (!row.length || sum === 0 || w === 0) return Infinity;
    let mx = 0; const s2 = sum * sum;
    for (const r of row) { const v = Math.max((w*w*r.area)/s2, s2/(w*w*r.area)); if(v>mx) mx=v; }
    return mx;
  }
  function flushLast(row, x0, y0, x1, y1) {
    const W = x1-x0, H = y1-y0, tall = H > W;
    const totalArea = row.reduce((s,r) => s + r.area, 0);
    if (totalArea <= 0) return;
    if (tall) {
      let off = 0;
      for (const r of row) {
        const frac = r.area / totalArea;
        r.node.x0 = x0 + off; r.node.x1 = x0 + off + frac * W;
        r.node.y0 = y0; r.node.y1 = y1;
        off += frac * W;
      }
    } else {
      let off = 0;
      for (const r of row) {
        const frac = r.area / totalArea;
        r.node.x0 = x0; r.node.x1 = x1;
        r.node.y0 = y0 + off; r.node.y1 = y0 + off + frac * H;
        off += frac * H;
      }
    }
  }
  function flush(row, rowSum, x0, y0, x1, y1) {
    const W = x1-x0, H = y1-y0, tall = H > W;
    if (tall) {
      const bandH = W > 0 ? rowSum / W : 0;
      let off = 0;
      for (let i = 0; i < row.length; i++) {
        const r = row[i];
        const itemW = bandH > 0 ? r.area / bandH : 0;
        r.node.x0 = x0 + off;
        r.node.x1 = i === row.length - 1 ? x0 + W : x0 + off + itemW;
        r.node.y0 = y0; r.node.y1 = y0 + bandH;
        off += itemW;
      }
    } else {
      const bandW = H > 0 ? rowSum / H : 0;
      let off = 0;
      for (let i = 0; i < row.length; i++) {
        const r = row[i];
        const itemH = bandW > 0 ? r.area / bandW : 0;
        r.node.x0 = x0; r.node.x1 = x0 + bandW;
        r.node.y0 = y0 + off;
        r.node.y1 = i === row.length - 1 ? y1 : y0 + off + itemH;
        off += itemH;
      }
    }
  }
  function layout(data, width, height) {
    const names = Object.keys(data.sectors);
    if (!names.length) return { leaves: [], sectorNodes: [] };
    const sectorNodes = names.map(name => {
      const stocks = data.sectors[name];
      const cap = stocks.reduce((s, st) => s + st.marketCap, 0);
      return { name, stocks, value: cap };
    }).filter(s => s.value > 0).sort((a,b) => b.value - a.value);
    const total = sectorNodes.reduce((s, n) => s + n.value, 0);
    if (total <= 0) return { leaves: [], sectorNodes: [] };
    const root = { children: sectorNodes, value: total };
    squarify(root, 0, 0, width, height);
    const leaves = [];
    const HDR = 14;
    for (const sec of sectorNodes) {
      if (sec.x0 == null) continue;
      const sx0 = sec.x0+0.5, sy0 = sec.y0+HDR, sx1 = sec.x1-0.5, sy1 = sec.y1-0.5;
      if (sx1<=sx0 || sy1<=sy0) continue;
      const nodes = sec.stocks.map(st => ({...st, value: st.marketCap, sector: sec.name}))
        .filter(st => st.value > 0).sort((a,b) => b.value - a.value);
      const sr = { children: nodes, value: sec.value };
      squarify(sr, sx0, sy0, sx1, sy1);
      for (const st of nodes) { if (st.x0 != null) leaves.push(st); }
      sec._b = { x0: sec.x0, y0: sec.y0, x1: sec.x1, y1: sec.y1 };
    }
    return { leaves, sectorNodes };
  }
  return { layout };
})();

// ===== Rendering =====
const canvas = document.getElementById('heatmap');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const loading = document.getElementById('loading');
const statsEl = document.getElementById('stats');
let result = null, dpr = window.devicePixelRatio || 1;

function resize() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w,h};
}

function color(pct) {
  const c = Math.max(-10, Math.min(10, pct));
  const t = (c+10)/20;
  if (t < 0.42) { const g=t/0.42; return 'rgb('+Math.round(20+g*40)+','+Math.round(70+g*110)+','+Math.round(20+g*30)+')'; }
  if (t > 0.58) { const g=(t-0.58)/0.42; return 'rgb('+Math.round(170+g*70)+','+Math.round(70-g*50)+','+Math.round(50-g*30)+')'; }
  return '#555';
}

function render() {
  if (!result) return;
  const {w,h} = resize();
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#333'; ctx.fillRect(0, 0, w, h);
  const {leaves, sectorNodes} = result;
  // 1) Sector background fill (eliminates blank gaps for small sectors)
  for (const s of sectorNodes) {
    if (!s._b) continue;
    const b=s._b, sw=b.x1-b.x0, sh=b.y1-b.y0;
    if (sw<1||sh<1) continue;
    const avg = s.stocks && s.stocks.length > 0
      ? s.stocks.reduce((sum,st) => sum + (st.changePct||0), 0) / s.stocks.length : 0;
    ctx.fillStyle = color(avg);
    ctx.fillRect(b.x0, b.y0, sw, sh);
  }
  // 2) Stock cells on top
  for (const l of leaves) {
    const lw=l.x1-l.x0, lh=l.y1-l.y0;
    if (lw<1||lh<1) continue;
    ctx.fillStyle = color(l.changePct);
    ctx.fillRect(l.x0, l.y0, lw, lh);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
    ctx.strokeRect(l.x0, l.y0, lw, lh);
    if (lw>28 && lh>14) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx=l.x0+lw/2, cy=l.y0+lh/2;
      if (lh>28 && lw>38) {
        ctx.font = lw>60?'11px sans-serif':'9px sans-serif';
        ctx.fillText(l.name, cx, cy-7, lw-4);
        ctx.font='9px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.7)';
        ctx.fillText((l.changePct>=0?'+':'')+l.changePct.toFixed(2)+'%', cx, cy+7, lw-4);
      } else {
        ctx.font='9px sans-serif';
        ctx.fillText(l.name, cx, cy, lw-4);
      }
    }
  }
  // 3) Sector headers on top
  for (const s of sectorNodes) {
    if (!s._b) continue;
    const b=s._b, sw=b.x1-b.x0;
    if (sw<35) continue;
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.fillRect(b.x0, b.y0, sw, 14);
    ctx.fillStyle='#eee'; ctx.font='bold 10px sans-serif';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(s.name, b.x0+4, b.y0+2, sw-8);
  }
}

// ===== Interaction =====
canvas.addEventListener('mousemove', e => {
  if (!result||!result.leaves) return;
  const r = canvas.getBoundingClientRect();
  const x=e.clientX-r.left, y=e.clientY-r.top;
  const hit = result.leaves.find(l => x>=l.x0&&x<=l.x1&&y>=l.y0&&y<=l.y1);
  if (hit) {
    const cls = hit.changePct>0?'up':hit.changePct<0?'down':'flat';
    const pct = (hit.changePct>=0?'+':'')+hit.changePct.toFixed(2)+'%';
    const cap = hit.marketCap>=1e12?(hit.marketCap/1e12).toFixed(2)+'万亿':(hit.marketCap/1e8).toFixed(1)+'亿';
    tooltip.innerHTML = '<div class="tt-name">'+hit.name+' ('+hit.code+')</div>'+
      '<div class="tt-row"><span class="tt-label">涨跌幅</span><span class="tt-val '+cls+'">'+pct+'</span></div>'+
      '<div class="tt-row"><span class="tt-label">现价</span><span class="tt-val">'+hit.price.toFixed(2)+'</span></div>'+
      '<div class="tt-row"><span class="tt-label">总市值</span><span class="tt-val">'+cap+'</span></div>'+
      '<div class="tt-row"><span class="tt-label">行业</span><span class="tt-val">'+hit.sector+'</span></div>';
    tooltip.style.display='block';
    let tx=x+14, ty=y+14;
    if(tx+170>r.width) tx=x-170;
    if(ty+90>r.height) ty=y-90;
    tooltip.style.left=Math.max(0,tx)+'px'; tooltip.style.top=Math.max(0,ty)+'px';
    canvas.style.cursor='pointer';
  } else { tooltip.style.display='none'; canvas.style.cursor='default'; }
});
canvas.addEventListener('mouseleave', ()=>{ tooltip.style.display='none'; });

// ===== Data =====
let raw = null;
window.addEventListener('message', e => {
  if (e.data.command==='update') { raw=e.data.data; loading.style.display='none'; doLayout(); }
});
function doLayout() {
  if (!raw) return;
  const wrap=document.getElementById('canvas-wrap');
  const w=wrap.clientWidth, h=wrap.clientHeight;
  if (w<=0||h<=0) return;
  result = Treemap.layout(raw, w, h);
  const t=result.leaves?result.leaves.length:0;
  const up=result.leaves?result.leaves.filter(l=>l.changePct>0).length:0;
  const dn=result.leaves?result.leaves.filter(l=>l.changePct<0).length:0;
  statsEl.textContent=t+'只 | ▲'+up+' ▼'+dn+' —'+(t-up-dn);
  render();
}
let rto; window.addEventListener('resize', ()=>{ clearTimeout(rto); rto=setTimeout(doLayout,80); });
document.getElementById('btn-refresh').addEventListener('click', ()=>{ loading.style.display='block'; vscode.postMessage({command:'refresh'}); });
document.getElementById('btn-fullscreen').addEventListener('click', ()=>{ vscode.postMessage({command:'fullscreen'}); });
vscode.postMessage({command:'ready'});
</script>
</body>
</html>`;
  }
}

module.exports = HeatmapProvider;
