/**
 * 状态栏管理模块
 */

const vscode = require("vscode");
const {
  getStocks,
  getMaxDisplayCount,
  getShowTwoLetterCode,
  getEnableMonitor,
} = require("../config");
const { getStockList } = require("../services/stockService");
const { updateStockData } = require("../utils/monitor");

class StatusBarManager {
  constructor() {
    this.statusBarItem = null;
    this.isVisible = true;
  }

  /**
   * 初始化状态栏
   */
  initialize() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "codetrader.manageStock";
    this.statusBarItem.text = "📊 CodeTrader";
    this.statusBarItem.tooltip = "CodeTrader - 点击管理股票";
    this.statusBarItem.show();
    console.log("[CodeTrader] 状态栏已初始化");
  }

  /**
   * 更新股票信息显示
   */
  async updateData() {
    if (!this.isVisible || !this.statusBarItem) {
      return;
    }

    const stocks = getStocks();

    // 无股票时的提示
    if (stocks.length === 0) {
      this.statusBarItem.text = "$(add) 点击添加自选股票";
      this.statusBarItem.tooltip = "点击管理股票，开始您的看盘之旅";
      return;
    }

    // 批量获取股票信息
    const stockInfos = await getStockList(stocks);

    // 无有效数据时的处理
    if (stockInfos.length === 0) {
      this.statusBarItem.text = "$(error) 股票获取失败";
      this.statusBarItem.tooltip = "请检查网络连接或股票代码是否正确";
      return;
    }

    // 监控股票异动
    const enableMonitor = getEnableMonitor();
    if (enableMonitor) {
      updateStockData(stockInfos);
    }

    // 状态栏显示前maxDisplayCount个股票
    const maxDisplayCount = getMaxDisplayCount();
    const displayStocks = stockInfos.slice(0, maxDisplayCount);
    const showTwoLetterCode = getShowTwoLetterCode();

    // 构建状态栏文本
    const stockTexts = displayStocks.map((stock) => {
      const symbol = stock.isUp ? "↗" : "↘";
      const displayName =
        showTwoLetterCode && stock.name.length > 2
          ? stock.name.substring(0, 2)
          : stock.name;
      return `${displayName} ${stock.current} ${symbol}${stock.changePercent}%`;
    });

    // 处理超出显示限制的情况
    const text = stockTexts.join(" | ");
    const finalText =
      stockInfos.length > maxDisplayCount
        ? `${text} ...(${stockInfos.length - maxDisplayCount}+)`
        : text;

    this.statusBarItem.text = finalText;

    // 构建悬停提示 - 按涨幅从高到低排序
    const sortedStocks = [...stockInfos].sort(
      (a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent)
    );
    let tooltip = sortedStocks
      .map(
        (stock) =>
          `${stock.name}(${stock.code}): ${stock.current} ${
            stock.change >= 0 ? "+" : ""
          }${stock.change}(${stock.changePercent}%)`
      )
      .join("\n");

    // 添加获取失败提示（如果有）
    if (stocks.length > stockInfos.length) {
      const failedCount = stocks.length - stockInfos.length;
      tooltip += `\n\n$(warning) ${failedCount}只股票获取失败`;
    }

    this.statusBarItem.tooltip = tooltip;
  }

  /**
   * 切换显示/隐藏
   */
  toggleVisibility() {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.updateData();
    } else {
      if (this.statusBarItem) {
        this.statusBarItem.text = "$(eye-closed)";
        this.statusBarItem.tooltip =
          "状态栏股票信息已隐藏\n点击后选择'显示状态栏'";
      }
    }
  }

  /**
   * 获取是否可见
   */
  getIsVisible() {
    return this.isVisible;
  }

  /**
   * 获取状态栏项（用于注册命令）
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  /**
   * 销毁状态栏
   */
  dispose() {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

module.exports = StatusBarManager;
