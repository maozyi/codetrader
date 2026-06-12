/**
 * 大盘数据服务
 * 使用新浪财经 API 获取三大指数 + 涨跌统计
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");
const { isTradingTime } = require("../utils/tradingTime");

const SINA_HEADERS = {
  Referer: "https://finance.sina.com.cn",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// Smart cache: TTL during trading hours, keeps overnight otherwise
/**
 * Get the timestamp of the most recent market close (15:00 on last trading day).
 * If current time is before 15:00 today, returns yesterday's close.
 * Skips weekends.
 */
function getLastMarketClose(now) {
  const d = new Date(now);
  // If before 15:00, the last close was on the previous trading day
  if (d.getHours() < 15) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(15, 0, 0, 0);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}

function smartCache(fn, openTtl) {
  let last = 0;
  let value = null;

  return async (...args) => {
    const now = Date.now();
    const trading = isTradingTime();

    if (value !== null) {
      // During trading: check TTL
      if (trading && now - last < openTtl) {
        console.log(`[MarketService] Cache hit, age=${now - last}ms`);
        return value;
      }
      // After market close: valid if cached after the last close
      if (!trading && last > getLastMarketClose(now)) {
        console.log(`[MarketService] Using post-close cache (age=${Math.round((now - last) / 60000)}min)`);
        return value;
      }
    }

    value = await fn(...args);
    last = Date.now();
    console.log(`[MarketService] Fetched fresh data at ${new Date(last).toLocaleTimeString()}`);
    return value;
  };
}

/**
 * 获取三大指数（新浪行情 API）
 */
async function fetchIndices() {
  const codeMap = new Map([
    ["s_sh000001", "1.000001"],
    ["s_sz399001", "0.399001"],
    ["s_sz399006", "0.399006"],
  ]);

  const resp = await httpGet(
    `http://hq.sinajs.cn/list=${Array.from(codeMap.keys()).join(",")}`,
    { timeout: 8000, responseType: "arraybuffer", headers: SINA_HEADERS }
  );

  const text = simpleDecode(resp.data).trim();
  const lines = text.split("\n").filter((l) => l.trim());

  const indices = [];
  for (const line of lines) {
    const match = line.match(/"([^"]+)"/);
    if (!match) continue;
    const fields = match[1].split(",");
    if (fields.length < 6) continue;

    let code = "";
    for (const [key, val] of codeMap) {
      if (line.includes(key)) { code = val; break; }
    }

    indices.push({
      code,
      name: fields[0],
      price: parseFloat(fields[1]) || 0,
      changePct: parseFloat(fields[3]) || 0,
      change: parseFloat(fields[2]) || 0,
      amount: parseFloat(fields[5]) || 0,
    });
  }

  console.log(`[MarketService] Got ${indices.length} indices`);
  return { indices };
}

const PAGE_SIZE = 100;

function buildPageUrl(pn) {
  return (
    "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/" +
    `Market_Center.getHQNodeData?page=${pn}&num=${PAGE_SIZE}&sort=changepercent&asc=0&node=hs_a`
  );
}

/**
 * 获取涨跌分布统计 + 涨跌家数（新浪全 A 股分页，批量并行）
 */
async function fetchMarketStats() {
  const allItems = [];
  let page = 1;
  const maxPages = 60;
  const batchSize = 5;

  while (page <= maxPages) {
    const batchPages = [];
    for (let i = 0; i < batchSize && page + i <= maxPages; i++) {
      batchPages.push(page + i);
    }

    const results = await Promise.all(
      batchPages.map(async (pn) => {
        try {
          const r = await httpGet(buildPageUrl(pn), {
            timeout: 10000,
            headers: SINA_HEADERS,
          });
          return { page: pn, items: JSON.parse(r.data) };
        } catch (e) {
          console.error(`[MarketService] Page ${pn} error:`, e.message);
          return { page: pn, items: null, error: e.message };
        }
      })
    );

    let emptyFound = false;
    for (const { page: pn, items, error } of results) {
      if (error) { emptyFound = true; break; }
      if (!Array.isArray(items) || items.length === 0) { emptyFound = true; break; }
      for (const item of items) {
        if (item.symbol && item.changepercent != null) {
          allItems.push(item);
        }
      }
    }

    console.log(`[MarketService] Pages ${batchPages[0]}-${batchPages[batchPages.length - 1]}, total: ${allItems.length}`);
    page += batchSize;
    if (emptyFound) break;
  }

  // Compute breadth & distribution
  let upCount = 0, downCount = 0, flatCount = 0;

  const bins = {
    limitUp: 0, gt7: 0, gt5: 0, gt2: 0, gt0: 0,
    flat: 0, lt0: 0, lt2: 0, lt5: 0, lt7: 0, limitDown: 0,
  };

  for (const item of allItems) {
    const pct = parseFloat(item.changepercent);
    const amt = parseFloat(item.amount);

    // Skip invalid or suspended (no volume)
    if (isNaN(pct) || isNaN(amt)) continue;
    if (amt <= 0) continue;

    // Breadth
    if (pct > 0) upCount++;
    else if (pct < 0) downCount++;
    else flatCount++;

    // Determine board-specific limit thresholds
    // symbol like "sh600000", "sz300750", "bj920634"
    const symbol = item.symbol || "";
    const name = item.name || "";
    const isST = name.includes("ST");             // ST/*ST stocks: ±5%
    const isSTAR = symbol.startsWith("sh68");     // 科创板 ±20%
    const isGEM = symbol.startsWith("sz30");      // 创业板 ±20%
    const isBSE = symbol.startsWith("bj");        // 北交所 ±30%

    let limitPct;
    if (isST) limitPct = 4.9;                     // ST 5% limit
    else if (isBSE) limitPct = 29.9;               // 北交所 30% limit
    else if (isSTAR || isGEM) limitPct = 19.9;      // 科创/创业板 20% limit
    else limitPct = 9.9;                           // 主板 10% limit

    // Distribution bins
    // Convention: labels like ">7%", "7~5%", "5~2%"
    // Boundary values go into the LOWER bin (e.g., 7.00% → "7~5%", not ">7%")
    // Positive: (lower, upper] — upper inclusive
    // Negative: [lower, upper) — lower inclusive
    if (pct >= limitPct) bins.limitUp++;
    else if (pct > 7) bins.gt7++;
    else if (pct > 5) bins.gt5++;
    else if (pct > 2) bins.gt2++;
    else if (pct > 0) bins.gt0++;
    else if (pct === 0) bins.flat++;
    else if (pct > -2) bins.lt0++;
    else if (pct > -5) bins.lt2++;
    else if (pct > -7) bins.lt5++;
    else if (pct > -limitPct) bins.lt7++;
    else bins.limitDown++;
  }

  console.log(`[MarketService] ${allItems.length} stocks, up=${upCount} down=${downCount} flat=${flatCount} bins:`, bins);
  return { bins, upCount, downCount, flatCount };
}

module.exports = {
  fetchIndices: smartCache(fetchIndices, 10_000),
  fetchMarketStats: smartCache(fetchMarketStats, 10_000),
};
