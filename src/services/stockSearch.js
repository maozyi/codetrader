/**
 * 股票搜索服务
 * 根据股票名称搜索股票代码
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");

/**
 * 根据股票名称搜索股票代码
 * @param {string} keyword - 股票名称或关键词
 * @returns {Promise<string|null>} 标准化的股票代码，如 sh600519，失败返回null
 */
async function searchStockCode(keyword) {
  const trimmed = keyword?.trim();
  if (!trimmed) return null;

  try {
    return await searchBySina(trimmed);
  } catch (error) {
    console.error("股票搜索失败:", error.message);
    return null;
  }
}

/**
 * 使用新浪API搜索股票
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<string|null>} 股票代码
 */
async function searchBySina(keyword) {
  try {
    const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(
      keyword
    )}`;
    const response = await httpGet(url, {
      timeout: 5000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const data = simpleDecode(response.data);
    const match = data.match(/var suggestvalue="([^"]+)"/);

    if (match?.[1]) {
      const items = match[1].split(";").filter((item) => item.trim());
      for (const item of items) {
        const [, , , fullCode] = item.split(",");
        // 验证A股代码:sh/sz开头且6位数字
        if (fullCode?.match(/^(sh|sz)\d{6}$/)) {
          return fullCode;
        }
      }
    }
  } catch (error) {
    console.error("新浪搜索失败:", error.message);
  }

  return null;
}

/**
 * Search stocks and return multiple results for display in dropdown
 * @param {string} keyword - Search keyword (name, code, or pinyin initials)
 * @returns {Promise<Array<{code: string, name: string, market: string}>>} Matching stocks
 */
async function searchStockList(keyword) {
  const trimmed = keyword?.trim();
  if (!trimmed) return [];

  try {
    const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(
      trimmed
    )}`;
    const response = await httpGet(url, {
      timeout: 5000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const data = simpleDecode(response.data);
    const match = data.match(/var suggestvalue="([^"]+)"/);
    const results = [];

    if (match?.[1]) {
      const items = match[1].split(";").filter((item) => item.trim());
      for (const item of items) {
        const parts = item.split(",");
        const name = parts[4] || parts[0] || "";
        const fullCode = parts[3];
        if (fullCode?.match(/^(sh|sz)\d{6}$/)) {
          results.push({
            code: fullCode,
            name: name,
            market: fullCode.substring(0, 2).toUpperCase(),
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error("搜索股票列表失败:", error.message);
    return [];
  }
}

module.exports = {
  searchStockCode,
  searchStockList,
};
