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
    this.isColorModeEnabled = false; // Default: color mode disabled (black text)
    this.isPanelPinned = false; // Default: auto-hide enabled
    this.mouseEnterDisposable = null;
    this.mouseLeaveDisposable = null;
    this.sortColumn = null; // null, 'price', 'change', 'changePercent'
    this.sortOrder = 'desc'; // 'asc' or 'desc'
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
    
    // 使用 Markdown 格式构建 tooltip
    const tooltipMarkdown = new vscode.MarkdownString();
    tooltipMarkdown.isTrusted = true;
    tooltipMarkdown.supportHtml = true;
    
    // 添加标题
    tooltipMarkdown.appendMarkdown('**💡 单击状态栏查看详情面板**\n\n');
    tooltipMarkdown.appendMarkdown('---\n\n');
    
    // 添加股票列表 - 每只股票一行显示
    sortedStocks.forEach((stock, index) => {
      const sign = stock.changePercent >= 0 ? '+' : '';
      tooltipMarkdown.appendMarkdown(
        `${stock.name}: ${stock.current} (${sign}${stock.changePercent}%)  \n`
      );
    });

    // 添加获取失败提示（如果有）
    if (stocks.length > stockInfos.length) {
      const failedCount = stocks.length - stockInfos.length;
      tooltipMarkdown.appendMarkdown(`\n⚠️ ${failedCount}只股票获取失败`);
    }

    this.statusBarItem.tooltip = tooltipMarkdown;
    
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

    // 监听 WebView 消息
    this.hoverPanel.webview.onDidReceiveMessage((message) => {
      if (message.command === "mouseenter") {
        // Mouse entered the panel
        this.isHoveringPanel = true;
        // Cancel any pending hide timeout
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
          this.hoverTimeout = null;
        }
      } else if (message.command === "mouseleave") {
        // Mouse left the panel
        this.isHoveringPanel = false;
        // Schedule auto-hide after 500ms (only if not pinned)
        if (!this.isPanelPinned) {
          this.scheduleAutoHide();
        }
      } else if (message.command === "toggleColorMode") {
        // Toggle color mode
        this.isColorModeEnabled = !this.isColorModeEnabled;
        // Update panel content with new color mode
        this.updateHoverPanelContent(this.currentStockInfos);
      } else if (message.command === "togglePinPanel") {
        // Toggle pin panel state
        this.isPanelPinned = !this.isPanelPinned;
        // Update panel content to reflect pin state
        this.updateHoverPanelContent(this.currentStockInfos);
      } else if (message.command === "sortByColumn") {
        // Handle column sort
        const column = message.column;
        if (this.sortColumn === column) {
          // Toggle sort order
          this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          // New column, default to desc
          this.sortColumn = column;
          this.sortOrder = 'desc';
        }
        // Update panel content
        this.updateHoverPanelContent(this.currentStockInfos);
      }
    });
  }

  /**
   * 更新悬浮框内容
   */
  updateHoverPanelContent(stockInfos) {
    if (!this.hoverPanel) {
      return;
    }

    let displayStocks;
    
    if (this.sortColumn) {
      // Column sort is active
      displayStocks = [...stockInfos].sort((a, b) => {
        let aVal, bVal;
        
        if (this.sortColumn === 'price') {
          aVal = parseFloat(a.current);
          bVal = parseFloat(b.current);
        } else if (this.sortColumn === 'change') {
          aVal = parseFloat(a.change);
          bVal = parseFloat(b.change);
        } else if (this.sortColumn === 'changePercent') {
          aVal = parseFloat(a.changePercent);
          bVal = parseFloat(b.changePercent);
        }
        
        if (this.sortOrder === 'desc') {
          return bVal - aVal;
        } else {
          return aVal - bVal;
        }
      });
    } else {
      // No sort, keep original order
      displayStocks = stockInfos;
    }

    const html = this.getHoverPanelHtml(displayStocks);
    this.hoverPanel.webview.html = html;
  }

  /**
   * 生成悬浮框 HTML
   */
  getHoverPanelHtml(stocks) {
    // Generate stock rows with conditional color classes
    const stockRows = stocks
      .map(
        (stock) => `
      <tr class="stock-row" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="stock-name">${this.escapeHtml(stock.name)}</td>
        <td class="stock-code">${this.escapeHtml(stock.code)}</td>
        <td class="stock-price ${this.isColorModeEnabled ? (stock.isUp ? "up" : "down") : ""}">${this.escapeHtml(
          stock.current
        )}</td>
        <td class="stock-change ${this.isColorModeEnabled ? (stock.isUp ? "up" : "down") : ""}">
          ${stock.change >= 0 ? "+" : ""}${this.escapeHtml(stock.change)}
        </td>
        <td class="stock-percent ${this.isColorModeEnabled ? (stock.isUp ? "up" : "down") : ""}">
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
    .control-bar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 20px;
      padding: 8px 12px;
      margin-bottom: 12px;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-wrap: wrap;
    }
    .toggle-item {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .toggle-item:hover {
      opacity: 0.8;
    }
    .toggle-switch {
      position: relative;
      width: 36px;
      height: 20px;
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 10px;
      transition: background-color 0.2s;
    }
    .toggle-switch.active {
      background-color: #d1d5db;
      border-color: #d1d5db;
    }
    .toggle-slider {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      background-color: #9ca3af;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle-switch.active .toggle-slider {
      transform: translateX(16px);
      background-color: #9ca3af;
    }
    .toggle-label {
      font-size: 13px;
      color: var(--vscode-foreground);
    }
    /* Custom tooltip */
    .toggle-item[data-tooltip] {
      position: relative;
    }
    .toggle-item[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 8px;
      padding: 4px 8px;
      background-color: var(--vscode-editorHoverWidget-background);
      border: 1px solid var(--vscode-editorHoverWidget-border);
      color: var(--vscode-editorHoverWidget-foreground);
      font-size: 12px;
      white-space: nowrap;
      border-radius: 3px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.1s ease-in;
      z-index: 1000;
    }
    .toggle-item[data-tooltip]:hover::after {
      opacity: 1;
      transition-delay: 0.2s;
    }
    th.sortable[data-tooltip] {
      position: relative;
    }
    th.sortable[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 4px 8px;
      background-color: var(--vscode-editorHoverWidget-background);
      border: 1px solid var(--vscode-editorHoverWidget-border);
      color: var(--vscode-editorHoverWidget-foreground);
      font-size: 12px;
      white-space: nowrap;
      border-radius: 3px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.1s ease-in;
      z-index: 1000;
    }
    th.sortable[data-tooltip]:hover::after {
      opacity: 1;
      transition-delay: 0.2s;
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
    th.sortable {
      cursor: pointer;
      user-select: none;
      position: relative;
      padding-right: 24px;
    }
    th.sortable:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .sort-icon {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .sort-arrow {
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
    }
    .sort-arrow.up {
      border-bottom: 5px solid #9ca3af;
    }
    .sort-arrow.down {
      border-top: 5px solid #9ca3af;
    }
    .sort-arrow.active {
      border-bottom-color: var(--vscode-foreground);
      border-top-color: var(--vscode-foreground);
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
    <div class="control-bar">
      <div class="toggle-item" id="colorModeToggle" data-tooltip="开启后根据涨跌显示红绿颜色">
        <div class="toggle-switch ${this.isColorModeEnabled ? 'active' : ''}" id="toggleColorSwitch">
          <div class="toggle-slider"></div>
        </div>
        <span class="toggle-label">彩色模式</span>
      </div>
      <div class="toggle-item" id="pinPanelToggle" data-tooltip="开启后鼠标离开页面不会自动关闭">
        <div class="toggle-switch ${this.isPanelPinned ? 'active' : ''}" id="togglePinSwitch">
          <div class="toggle-slider"></div>
        </div>
        <span class="toggle-label">固定页面</span>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>股票名称</th>
          <th>代码</th>
          <th class="sortable" data-column="price" data-tooltip="点击按现价排序">
            现价
            <span class="sort-icon">
              <span class="sort-arrow up ${this.sortColumn === 'price' && this.sortOrder === 'asc' ? 'active' : ''}"></span>
              <span class="sort-arrow down ${this.sortColumn === 'price' && this.sortOrder === 'desc' ? 'active' : ''}"></span>
            </span>
          </th>
          <th class="sortable" data-column="change" data-tooltip="点击按涨跌排序">
            涨跌
            <span class="sort-icon">
              <span class="sort-arrow up ${this.sortColumn === 'change' && this.sortOrder === 'asc' ? 'active' : ''}"></span>
              <span class="sort-arrow down ${this.sortColumn === 'change' && this.sortOrder === 'desc' ? 'active' : ''}"></span>
            </span>
          </th>
          <th class="sortable" data-column="changePercent" data-tooltip="点击按涨跌幅排序">
            涨跌幅
            <span class="sort-icon">
              <span class="sort-arrow up ${this.sortColumn === 'changePercent' && this.sortOrder === 'asc' ? 'active' : ''}"></span>
              <span class="sort-arrow down ${this.sortColumn === 'changePercent' && this.sortOrder === 'desc' ? 'active' : ''}"></span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        ${stockRows}
      </tbody>
    </table>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    
    // Track mouse enter/leave for the entire panel
    const hoverContainer = document.getElementById('hoverContainer');
    
    hoverContainer.addEventListener('mouseenter', () => {
      vscode.postMessage({
        command: 'mouseenter'
      });
    });
    
    hoverContainer.addEventListener('mouseleave', () => {
      vscode.postMessage({
        command: 'mouseleave'
      });
    });
    
    // Handle color mode toggle
    const colorModeToggle = document.getElementById('colorModeToggle');
    const toggleColorSwitch = document.getElementById('toggleColorSwitch');
    
    colorModeToggle.addEventListener('click', () => {
      // Toggle the active class
      toggleColorSwitch.classList.toggle('active');
      
      // Send message to extension
      vscode.postMessage({
        command: 'toggleColorMode'
      });
    });
    
    // Handle pin panel toggle
    const pinPanelToggle = document.getElementById('pinPanelToggle');
    const togglePinSwitch = document.getElementById('togglePinSwitch');
    
    pinPanelToggle.addEventListener('click', () => {
      // Toggle the active class
      togglePinSwitch.classList.toggle('active');
      
      // Send message to extension
      vscode.postMessage({
        command: 'togglePinPanel'
      });
    });
    
    // Handle column header clicks for sorting
    document.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const column = th.dataset.column;
        vscode.postMessage({
          command: 'sortByColumn',
          column: column
        });
      });
    });
    
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
   * 计划自动隐藏悬浮框（延迟）
   */
  scheduleAutoHide() {
    // 清除现有的隐藏计时器
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    
    // 设置新的隐藏计时器（500ms 延迟）
    this.hoverTimeout = setTimeout(() => {
      // 只有当鼠标不在悬浮框内时才隐藏
      if (!this.isHoveringPanel) {
        this.hideHoverPanel();
      }
    }, 500);
  }

  /**
   * 计划隐藏悬浮框（延迟）- 保留用于兼容
   */
  scheduleHide() {
    this.scheduleAutoHide();
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
