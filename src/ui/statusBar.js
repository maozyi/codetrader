/**
 * 状态栏管理模块
 */

const vscode = require("vscode");
const {
  getStocks,
  getMaxDisplayCount,
  getShowTwoLetterCode,
  getEnableMonitor,
  getHoverPanelHideDelay,
} = require("../config");
const { getStockList } = require("../services/stockService");
const { updateStockData } = require("../utils/monitor");

class StatusBarManager {
  constructor() {
    this.statusBarItem = null;
    this.isVisible = true;
    this.hoverPanel = null;
    this.hoverTimeout = null;
    this.isHoveringPanel = false;
    this.isHoveringStatusBar = false;
    this.currentStockInfos = [];
    this.clickTimer = null;
    this.clickCount = 0;
  }

  /**
   * 初始化状态栏
   */
  initialize() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    // 使用自定义命令处理单击/双击
    this.statusBarItem.command = "codetrader.handleStatusBarClick";
    this.statusBarItem.text = "📊 CodeTrader";
    this.statusBarItem.tooltip = "CodeTrader - 单击查看详情，双击管理股票";
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
    
    // 保存当前股票信息，用于悬浮框显示
    this.currentStockInfos = stockInfos;
    
    // 如果悬浮框已显示，更新其内容
    if (this.hoverPanel) {
      this.updateHoverPanelContent(stockInfos);
    }
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
   * 处理状态栏点击事件（区分单击和双击）
   */
  handleStatusBarClick() {
    this.clickCount++;
    
    // 清除之前的计时器
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }
    
    // 设置新的计时器
    this.clickTimer = setTimeout(() => {
      if (this.clickCount === 1) {
        // 单击：显示悬浮框
        this.showHoverPanel();
      } else if (this.clickCount >= 2) {
        // 双击：打开管理菜单
        vscode.commands.executeCommand("codetrader.manageStock");
      }
      this.clickCount = 0;
    }, 300); // 300ms 内的点击视为双击
  }

  /**
   * 显示悬浮框
   */
  showHoverPanel() {
    // 如果已经有悬浮框，取消隐藏计时器并保持显示
    if (this.hoverPanel) {
      this.isHoveringStatusBar = true;
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
      return;
    }

    if (this.currentStockInfos.length === 0) {
      vscode.window.showInformationMessage("暂无股票数据，请先添加自选股票");
      return;
    }

    // 创建 WebView Panel - 显示股票详情悬浮框
    this.hoverPanel = vscode.window.createWebviewPanel(
      "stockHover",
      "📊 详情",
      vscode.ViewColumn.Two, // 在第二列显示，如果没有则创建
      {
        enableScripts: true,
        retainContextWhenHidden: true, // 保持内容不被销毁
        localResourceRoots: [], // 不需要本地资源
      }
    );

    // 初始状态：假设鼠标会移入面板，避免立即隐藏
    this.isHoveringStatusBar = false;
    this.isHoveringPanel = true;

    // 设置悬浮框位置和大小（通过 CSS 实现）
    this.updateHoverPanelContent(this.currentStockInfos);

    // 监听悬浮框关闭事件
    this.hoverPanel.onDidDispose(() => {
      this.hoverPanel = null;
      this.isHoveringPanel = false;
      this.isHoveringStatusBar = false;
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
    });

    // 监听 WebView 消息（预留用于未来的图表交互等功能）
    this.hoverPanel.webview.onDidReceiveMessage((message) => {
      if (message.command === "mouseenter") {
        this.isHoveringPanel = true;
        this.isHoveringStatusBar = false;
      } else if (message.command === "mouseleave") {
        this.isHoveringPanel = false;
      }
      // 注意：不再自动隐藏面板，用户需要手动关闭
    });
  }

  /**
   * 更新悬浮框内容
   */
  updateHoverPanelContent(stockInfos) {
    if (!this.hoverPanel) {
      return;
    }

    // 上证指数（sh000001）始终在最前面，其他股票按涨幅从高到低排序
    const shanghaiIndex = stockInfos.find(stock => stock.code === 'sh000001');
    const otherStocks = stockInfos.filter(stock => stock.code !== 'sh000001');
    
    // 其他股票按涨幅排序
    const sortedOtherStocks = otherStocks.sort(
      (a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent)
    );
    
    // 如果有上证指数，放在最前面
    const sortedStocks = shanghaiIndex 
      ? [shanghaiIndex, ...sortedOtherStocks]
      : sortedOtherStocks;

    const html = this.getHoverPanelHtml(sortedStocks);
    this.hoverPanel.webview.html = html;
  }

  /**
   * 生成悬浮框 HTML
   */
  getHoverPanelHtml(stocks) {
    const stockRows = stocks
      .map(
        (stock) => `
      <tr class="stock-row" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="stock-name">${this.escapeHtml(stock.name)}</td>
        <td class="stock-code">${this.escapeHtml(stock.code)}</td>
        <td class="stock-price ${stock.isUp ? "up" : "down"}">${this.escapeHtml(
          stock.current
        )}</td>
        <td class="stock-change ${stock.isUp ? "up" : "down"}">
          ${stock.change >= 0 ? "+" : ""}${this.escapeHtml(stock.change)}
        </td>
        <td class="stock-percent ${stock.isUp ? "up" : "down"}">
          ${stock.changePercent >= 0 ? "+" : ""}${this.escapeHtml(
          stock.changePercent
        )}%
        </td>
      </tr>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>股票详情</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      overflow: auto;
      height: 100vh;
    }
    .hover-container {
      max-width: 600px;
      padding: 4px;
      min-height: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th {
      padding: 8px 12px;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      white-space: nowrap;
    }
    /* 列宽分配 */
    th:nth-child(1), td:nth-child(1) { width: 25%; } /* 股票名称 */
    th:nth-child(2), td:nth-child(2) { width: 20%; } /* 代码 */
    th:nth-child(3), td:nth-child(3) { width: 20%; } /* 现价 */
    th:nth-child(4), td:nth-child(4) { width: 17.5%; } /* 涨跌 */
    th:nth-child(5), td:nth-child(5) { width: 17.5%; } /* 涨跌幅 */
    
    /* 对齐方式 */
    th:nth-child(1), td:nth-child(1) { text-align: left; }
    th:nth-child(2), td:nth-child(2) { text-align: left; }
    th:nth-child(3), td:nth-child(3) { text-align: right; }
    th:nth-child(4), td:nth-child(4) { text-align: right; }
    th:nth-child(5), td:nth-child(5) { text-align: right; }
    
    .stock-row {
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .stock-row:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    td {
      padding: 8px 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .stock-name {
      font-weight: 500;
    }
    .stock-code {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .stock-price {
      font-weight: 500;
    }
    .up {
      color: #f85149;
    }
    .down {
      color: #3fb950;
    }
  </style>
</head>
<body>
  <div class="hover-container" id="hoverContainer">
    <table>
      <thead>
        <tr>
          <th>股票名称</th>
          <th>代码</th>
          <th>现价</th>
          <th>涨跌</th>
          <th>涨跌幅</th>
        </tr>
      </thead>
      <tbody>
        ${stockRows}
      </tbody>
    </table>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    
    // 监听股票行点击事件（预留：未来可用于显示分时图等详细信息）
    document.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('click', () => {
        const code = row.dataset.code;
        const name = row.dataset.name;
        // TODO: 未来可以在这里发送消息到后端，请求显示该股票的分时图
        // vscode.postMessage({ 
        //   command: 'showStockChart', 
        //   code: code,
        //   name: name 
        // });
        console.log('点击股票:', name, code);
      });
      
      // 添加鼠标悬停效果提示
      row.style.cursor = 'pointer';
    });
  </script>
</body>
</html>`;
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * 隐藏悬浮框
   */
  hideHoverPanel() {
    if (this.hoverPanel) {
      this.hoverPanel.dispose();
      this.hoverPanel = null;
    }
    this.isHoveringPanel = false;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  /**
   * 计划隐藏悬浮框（延迟）
   */
  scheduleHide() {
    // 清除现有的隐藏计时器
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    
    // 设置新的隐藏计时器
    const hideDelay = getHoverPanelHideDelay();
    this.hoverTimeout = setTimeout(() => {
      // 只有当鼠标既不在状态栏也不在悬浮框时才隐藏
      if (!this.isHoveringPanel && !this.isHoveringStatusBar) {
        this.hideHoverPanel();
      }
    }, hideDelay);
  }

  /**
   * 销毁状态栏
   */
  dispose() {
    this.hideHoverPanel();
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

module.exports = StatusBarManager;
