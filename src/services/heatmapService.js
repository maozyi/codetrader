/**
 * 热力图数据服务
 * 使用新浪财经 API 获取实时行情，结合本地行业映射按行业分组
 */

const { httpGet } = require("../utils/httpClient");
const path = require("path");
const fs = require("fs");

// Load static industry mapping (stock code → industry name)
let industryMap = null;
function getIndustryMap() {
  if (!industryMap) {
    try {
      const mapPath = path.join(__dirname, "industryMap.json");
      industryMap = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
      console.log(`[HeatmapService] Loaded industry map: ${Object.keys(industryMap).length} stocks`);
    } catch (e) {
      console.error("[HeatmapService] Failed to load industry map:", e.message);
      industryMap = {};
    }
  }
  return industryMap;
}

function getIndustry(code) {
  return getIndustryMap()[code] || "其他";
}

const SINA_HEADERS = {
  Referer: "https://finance.sina.com.cn",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

const PAGE_SIZE = 100;

function buildPageUrl(pn) {
  return (
    "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/" +
    `Market_Center.getHQNodeData?page=${pn}&num=${PAGE_SIZE}&sort=changepercent&asc=0&node=hs_a`
  );
}

/**
 * 获取全部 A 股实时数据（供热力图使用）
 * @returns {Promise<{sectors: Object}>} 按行业分组的股票数据
 */
async function _fetchHeatmapData() {
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
          return { page: pn, items: null, error: e.message };
        }
      })
    );

    let emptyFound = false;
    for (const { page: pn, items, error } of results) {
      if (error) {
        console.error(`[HeatmapService] Page ${pn} error:`, error);
        emptyFound = true;
        break;
      }
      if (!Array.isArray(items) || items.length === 0) {
        emptyFound = true;
        break;
      }
      for (const item of items) {
        if (item.symbol && item.changepercent != null) {
          allItems.push(item);
        }
      }
    }

    console.log(`[HeatmapService] Pages ${batchPages[0]}-${batchPages[batchPages.length - 1]}, total: ${allItems.length}`);
    page += batchSize;
    if (emptyFound) break;
  }

  // Group by industry (from static mapping)
  const sectors = {};
  let mappedCount = 0, unmappedCount = 0;

  for (const item of allItems) {
    const code = item.code;
    const name = item.name;
    const changePct = item.changepercent;
    const pricechange = item.pricechange;
    const price = item.trade;
    const marketCap = item.mktcap;

    if (!code || !name) continue;
    if (changePct == null || marketCap == null) continue;

    const mktcapNum = parseFloat(marketCap);
    if (isNaN(mktcapNum) || mktcapNum <= 0) continue;

    const sector = getIndustry(code);
    if (sector === "其他") unmappedCount++;
    else mappedCount++;

    if (!sectors[sector]) sectors[sector] = [];

    sectors[sector].push({
      code,
      name,
      changePct: parseFloat(changePct) || 0,
      change: parseFloat(pricechange) || 0,
      price: parseFloat(price) || 0,
      marketCap: mktcapNum,
    });
  }

  const totalStocks = Object.values(sectors).reduce((s, arr) => s + arr.length, 0);
  console.log(
    `[HeatmapService] Got ${totalStocks} stocks in ${Object.keys(sectors).length} industries (mapped: ${mappedCount}, other: ${unmappedCount})`
  );
  return { sectors };
}

// Stale-while-revalidate cache
let cachedValue = null;
let pending = null;

async function fetchHeatmapData() {
  if (pending) {
    console.log(`[HeatmapService] Sharing in-flight request`);
    return pending;
  }

  pending = _fetchHeatmapData().then((result) => {
    cachedValue = result;
    return result;
  }).finally(() => {
    pending = null;
  });

  return pending;
}

function getCachedHeatmapData() {
  return cachedValue;
}

module.exports = { fetchHeatmapData, getCachedHeatmapData };
