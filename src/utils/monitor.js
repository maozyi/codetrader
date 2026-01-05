const vscode = require("vscode");
// 缓存股票数据
const stockCache = {};
const msgMap = {
  0: "无异动",
  1: "主力+1",
  2: "主力+2",
  3: "主力+3",
  4: "主力-1",
  5: "主力-2",
  6: "主力-3",
};
// 更新股票数据
function updateStockData(list) {
  if (!list || list.length === 0) {
    return;
  }
  list.forEach((item) => {
    const { code, name, current, amount, dateTime } = item;
    // 指数、基金等不监控
    const ignoreNames = ["指数", "基金", "扳指", "综指", "成指"];
    if (ignoreNames.some((item) => name.includes(item))) {
      return;
    }
    const info = {
      current: Number(current),
      amount: Number(amount),
      dateTime: new Date(dateTime).getTime(),
    };
    const listInfo = stockCache[code];
    if (!listInfo) {
      stockCache[code] = [info];
    } else if (listInfo.length < 3) {
      listInfo.push(info);
    } else {
      listInfo.shift();
      listInfo.push(info);
      const input = [
        listInfo[0].dateTime,
        listInfo[0].current,
        listInfo[0].amount,
        listInfo[1].dateTime,
        listInfo[1].current,
        listInfo[1].amount,
        listInfo[2].dateTime,
        listInfo[2].current,
        listInfo[2].amount,
      ];
      const msgIndex = getOutput(input);
      if (msgIndex !== 0) {
        vscode.window.showInformationMessage(`${name} ${msgMap[msgIndex]}`);
      }
    }
  });
}
// 获取异动情况
// 输入: [时间1, 价格1, 成交额1, 时间2, 价格2, 成交额2,时间3, 价格3, 成交额3]
// 输出: 0-无异动, 1-主力+1, 2-主力+2, 3-主力+3, 4-主力-1, 5-主力-2, 6-主力-3
const getOutput = (input) => {
  if (input.length !== 9) {
    return 0;
  }
  // 有数据为零为失效数据
  if (input.some((item) => item === 0)) {
    return 0;
  }
  // 结束时间-开始时间大于30秒或小于6秒记为失效数据
  const timeRange = (Number(input[6]) - Number(input[0])) / 1000;
  if (timeRange > 30 || timeRange < 6) {
    return 0;
  }
  // 计算第一段价差和成交额
  const firstAmountDiff = Number(input[5]) - Number(input[2]);
  // 计算第二段价差和成交额
  const secondPriceDiff = parseFloat(
    (Number(input[7]) - Number(input[4])).toFixed(3)
  );
  const secondAmountDiff = Number(input[8]) - Number(input[5]);
  // 如果第二段价差为零, 则记为无异动
  if (secondPriceDiff === 0) {
    return 0;
  }
  // 计算放量程度(第二段成交额/第一段成交额)
  const amountRatio = parseFloat(
    (secondAmountDiff / firstAmountDiff).toFixed(3)
  );
  // 如果放量程度是NaN或是Infinity或小于2, 则记为无异动
  if (isNaN(amountRatio) || amountRatio === Infinity || amountRatio < 2) {
    return 0;
  }
  // 如果第二段价差大于0, 则记为主力+1
  let num = 0;
  if (secondPriceDiff > 0) {
    num = 1;
    // 如果放量程度大于5, 则记为主力+2
    if (amountRatio > 5) num = 2;
    // 如果放量程度大于20, 则记为主力+3
    if (amountRatio > 20) num = 3;
  } else if (secondPriceDiff < 0) {
    num = 4;
    // 如果放量程度大于5, 则记为主力-2
    if (amountRatio > 5) num = 5;
    // 如果放量程度大于20, 则记为主力-3
    if (amountRatio > 20) num = 6;
  }
  return num;
};

module.exports = {
  updateStockData,
};
