/**
 * 板块数据服务
 * 获取板块涨跌幅、成交额等数据
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");

/**
 * 获取板块列表数据（新浪）
 * @returns {Promise<Array<{code: string, name: string, changePct: number, amount: number, stockCount: number}>>}
 */
async function getSectorList() {
  try {
    //新浪板块数据API
    const url = `http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php`;
    
    const response = await httpGet(url, {
      timeout: 5000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const data = simpleDecode(response.data);
    
    // 解析 JavaScript 变量格式: var S_Finance_bankuai_sinaindustry = {...}
    const match = data.match(/var\s+\w+\s*=\s*(\{[^;]+\})/);
    if (!match) {
      console.error("[SectorService] Failed to parse response");
      return [];
    }

    const jsonStr = match[1];
    const sectorData = JSON.parse(jsonStr);
    const sectors = [];
    
    for (const [code, value] of Object.entries(sectorData)) {
      const parts = value.split(",");
      
      if (parts.length < 7) continue;
      
      const name = parts[1];
      const stockCount = parseInt(parts[2]) || 0;
      const changePct = parseFloat(parts[5]) || 0;
      const amount = parseFloat(parts[6]) || 0;
      
      if (name && !isNaN(changePct) && amount > 0) {
        sectors.push({
          code,
          name,
          changePct,
          amount,
          stockCount,
        });
      }
    }

    console.log(`[SectorService] Got ${sectors.length} sectors`);
    return sectors;
  } catch (error) {
    console.error("[SectorService] Failed to get sector list:", error.message);
    return [];
  }
}

/**
 * 获取所有A股的实时数据（用于热力图）
 * @returns {Promise<Array<{code: string, name: string, changePct: number, marketCap: number, sector: string}>>}
 */
async function getAllStocksForHeatmap() {
  try {
    // 分别获取沪深A股
    const shStocks = await getMarketStocks('sh');
    const szStocks = await getMarketStocks('sz');
    
    const allStocks = [...shStocks, ...szStocks];
    console.log(`[SectorService] Got ${allStocks.length} stocks for heatmap`);
    return allStocks;
  } catch (error) {
    console.error("[SectorService] Failed to get stocks:", error.message);
    return [];
  }
}

/**
 * 获取指定市场的股票
 */
async function getMarketStocks(market) {
  try {
    // 使用新浪行情中心API
    const url = `http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=5000&sort=changepercent&asc=0&node=${market === 'sh' ? 'hs_a' : 'hs_a'}&symbol=&_s_r_a=page`;
    
    const response = await httpGet(url, {
      timeout: 10000,
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const data = JSON.parse(response.data);
    if (!Array.isArray(data)) return [];

    return data.filter(item => item && item.symbol && item.changepercent != null)
      .map(item => ({
        code: item.symbol,
        name: item.name || item.symbol,
        changePct: parseFloat(item.changepercent) || 0,
        marketCap: parseFloat(item.amount) || 0, // 使用成交额代替市值
        price: parseFloat(item.trade) || 0,
      }));
  } catch (error) {
    console.error(`[SectorService] Failed to get ${market} stocks:`, error.message);
    return [];
  }
}

module.exports = {
  getSectorList,
  getAllStocksForHeatmap,
};
