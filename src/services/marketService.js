/**
 * 大盘数据服务
 * 使用新浪财经 API 获取三大指数 + 涨跌统计
 *
 * Cache strategy: stale-while-revalidate
 * - getCached() returns last known data instantly (no TTL)
 * - refresh() forces a fresh fetch, deduping concurrent calls
 * - After market close, refresh() returns cached data (no API calls)
 *   unless cache is from before the most recent close
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");
const { isTradingTime } = require("../utils/tradingTime");

const SINA_HEADERS = {
  Referer: "https://finance.sina.com.cn",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

function getLastMarketClose(now) {
  const d = new Date(now);
  if (d.getHours() < 15) d.setDate(d.getDate() - 1);
  d.setHours(15, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.getTime();
}

// Creates a stale-while-revalidate cache for an async function
function createCache(fn) {
  let value = null;
  let lastFetch = 0;
  let pending = null;

  return {
    /** Return last known data (may be null if never fetched) */
    get() {
      return value;
    },

    /**
     * Fetch fresh data if needed.
     * - During trading: always fetches
     * - After close: only fetches if cache is from before close, otherwise returns cached
     * - Deduplicates concurrent calls
     */
    async refresh() {
      const now = Date.now();
      const trading = isTradingTime();

      // After market close: if cache is from after close, no need to refresh
      if (!trading && value !== null && lastFetch > getLastMarketClose(now)) {
        console.log(`[MarketService] Post-close, cache valid (age=${Math.round((now - lastFetch) / 60000)}min)`);
        return value;
      }

      // If a fetch is already in flight, share it
      if (pending) {
        console.log(`[MarketService] Sharing in-flight request`);
        return pending;
      }

      console.log(`[MarketService] Fetching fresh data...`);
      pending = fn().then((result) => {
        value = result;
        lastFetch = Date.now();
        console.log(`[MarketService] Fresh data ready at ${new Date(lastFetch).toLocaleTimeString()}`);
        return result;
      }).finally(() => {
        pending = null;
      });

      return pending;
    }
  };
}

/**
 * 获取三大指数（新浪行情 API）
 */
async function _fetchIndices() {
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
async function _fetchMarketStats() {
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

  let upCount = 0, downCount = 0, flatCount = 0;

  const bins = {
    limitUp: 0, gt7: 0, gt5: 0, gt2: 0, gt0: 0,
    flat: 0, lt0: 0, lt2: 0, lt5: 0, lt7: 0, limitDown: 0,
  };

  for (const item of allItems) {
    const pct = parseFloat(item.changepercent);
    const amt = parseFloat(item.amount);

    if (isNaN(pct) || isNaN(amt)) continue;
    if (amt <= 0) continue;

    if (pct > 0) upCount++;
    else if (pct < 0) downCount++;
    else flatCount++;

    const symbol = item.symbol || "";
    const name = item.name || "";
    const isST = name.includes("ST");
    const isSTAR = symbol.startsWith("sh68");
    const isGEM = symbol.startsWith("sz30");
    const isBSE = symbol.startsWith("bj");

    let limitPct;
    if (isST) limitPct = 4.9;
    else if (isBSE) limitPct = 29.9;
    else if (isSTAR || isGEM) limitPct = 19.9;
    else limitPct = 9.9;

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

// Create cached instances
const indicesCache = createCache(_fetchIndices);
const statsCache = createCache(_fetchMarketStats);

module.exports = {
  // For stale-while-revalidate: get cached instantly, refresh in background
  getCachedIndices: indicesCache.get,
  getCachedStats: statsCache.get,
  refreshIndices: () => indicesCache.refresh(),
  refreshStats: () => statsCache.refresh(),
  // Convenience: start both refreshes in parallel
  refreshAll: () => Promise.all([indicesCache.refresh(), statsCache.refresh()]),
};
