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
    } else if (listInfo.length < 5) {
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
        listInfo[3].dateTime,
        listInfo[3].current,
        listInfo[3].amount,
        listInfo[4].dateTime,
        listInfo[4].current,
        listInfo[4].amount,
      ];
      const msgIndex = getOutput(input);
      if (msgIndex !== 0) {
        vscode.window.showInformationMessage(`${name} ${msgMap[msgIndex]}`);
      }
    }
  });
}
// 获取异动情况
// 输入: [时间1, 价格1, 成交额1, 时间2, 价格2, 成交额2, 时间3, 价格3, 成交额3, 时间4, 价格4, 成交额4, 时间5, 价格5, 成交额5]
// 输出: 0-无异动, 1-主力+1, 2-主力+2, 3-主力+3, 4-主力-1, 5-主力-2, 6-主力-3
const getOutput = (input) => {
  if (input.length !== 15) {
    return 0;
  }
  // 有数据为零为失效数据
  if (input.some((item) => item === 0)) {
    return 0;
  }
  // 结束时间-开始时间大于28秒或小于12秒记为失效数据
  const timeRange = (Number(input[12]) - Number(input[0])) / 1000;
  if (timeRange > 28 || timeRange < 12) {
    return 0;
  }
  // 计算尾段价差
  const lastPriceDiff = parseFloat(
    (Number(input[13]) - Number(input[10])).toFixed(3)
  );
  // 如果尾段价差为零, 则记为无异动
  if (lastPriceDiff === 0) {
    return 0;
  }
  // 计算成交额差
  const amountDiff1 = Number(input[5]) - Number(input[2]);
  const amountDiff2 = Number(input[8]) - Number(input[5]);
  const amountDiff3 = Number(input[11]) - Number(input[8]);
  const amountDiff4 = Number(input[14]) - Number(input[11]);
  // 如果有任何一个成交额为零, 则记为无异动
  if (amountDiff1 === 0 || amountDiff2 === 0 || amountDiff3 === 0 || amountDiff4 === 0) {
    return 0;
  }
  // 计算前三段均量
  const avgAmount1 = (amountDiff1 + amountDiff2 + amountDiff3) / 3;
  // 计算放量程度(第四段成交额/前三段均量)
  const amountRatio = parseFloat(
    (amountDiff4 / avgAmount1).toFixed(3)
  );
  // 如果放量程度是NaN或是Infinity或小于2, 则记为无异动
  if (isNaN(amountRatio) || amountRatio === Infinity || amountRatio < 2) {
    return 0;
  }
  // 如果第二段价差大于0, 则记为主力+1
  let num = 0;
  if (lastPriceDiff > 0) {
    num = 1;
    // 如果放量程度大于5, 则记为主力+2
    if (amountRatio > 5) num = 2;
    // 如果放量程度大于20, 则记为主力+3
    if (amountRatio > 20) num = 3;
  } else if (lastPriceDiff < 0) {
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
