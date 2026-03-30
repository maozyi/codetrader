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
    this.isColorModeEnabled = false; // Default: color mode disabled (black text)
    this.isPanelPinned = false; // Default: auto-hide enabled
    this.mouseEnterDisposable = null;
    this.mouseLeaveDisposable = null;
    this.sortColumn = null; // null, 'price', 'change', 'changePercent'
    this.sortOrder = 'desc'; // 'asc' or 'desc'
    this.stockManager = null; // Will be set by setStockManager
    this.updateCallback = null; // Callback for updating data after stock changes
    this.groups = []; // Stock groups
    this.currentGroupId = 'all'; // Current active group tab ('all' or group id)
  }

  /**
   * Set stock manager and update callback
   */
  setStockManager(stockManager, updateCallback) {
    this.stockManager = stockManager;
    this.updateCallback = updateCallback;
  }

  /**
   * 初始化状态栏
   */
  initialize() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    // 单击显示详情页
    this.statusBarItem.command = "codetrader.showHoverPanel";
    this.statusBarItem.text = "📊 CodeTrader";
    this.statusBarItem.tooltip = "CodeTrader - 点击查看详情";
    this.statusBarItem.show();
    
    // Load stock groups
    const { getStockGroups } = require("../config");
    this.groups = getStockGroups();
    
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
      this.statusBarItem.tooltip = "点击打开详情页添加股票";
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
    this.hoverPanel.webview.onDidReceiveMessage(async (message) => {
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
      } else if (message.command === "addStock") {
        // Handle add stock
        if (this.stockManager && this.updateCallback) {
          this.stockManager.addStock(this.updateCallback);
        }
      } else if (message.command === "confirmRemove") {
        // Handle batch remove
        console.log('[CodeTrader] Received confirmRemove command', message);
        const selectedCodes = message.codes;
        if (selectedCodes && selectedCodes.length > 0) {
          console.log('[CodeTrader] Removing codes:', selectedCodes);
          await this.handleBatchRemove(selectedCodes);
        } else {
          console.log('[CodeTrader] No codes selected');
        }
      } else if (message.command === "switchGroup") {
        // Switch to different group tab
        this.currentGroupId = message.groupId;
        this.updateHoverPanelContent(this.currentStockInfos);
      } else if (message.command === "createGroup") {
        // Create new group
        await this.handleCreateGroup(message.name, message.stocks);
      } else if (message.command === "deleteGroup") {
        // Delete group
        await this.handleDeleteGroup(message.groupId);
      }
    });
  }

  /**
   * Handle batch remove stocks
   */
  async handleBatchRemove(codes) {
    const { getStocks, saveStocks } = require("../config");
    const stocks = getStocks();
    const newStocks = stocks.filter(s => !codes.includes(s));
    await saveStocks(newStocks);
    
    const vscode = require("vscode");
    vscode.window.showInformationMessage(`已移除 ${codes.length} 只股票`);
    
    // Trigger update
    if (this.updateCallback) {
      this.updateCallback();
    }
  }

  /**
   * Handle create group
   */
  async handleCreateGroup(name, stocks) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    // Generate unique ID
    const groupId = 'group-' + Date.now();
    
    // Add new group
    this.groups.push({
      id: groupId,
      name: name,
      stocks: stocks
    });
    
    // Save to config
    await saveStockGroups(this.groups);
    
    // Switch to the new group
    this.currentGroupId = groupId;
    
    vscode.window.showInformationMessage(`分组"${name}"创建成功`);
    
    // Trigger update
    if (this.updateCallback) {
      this.updateCallback();
    }
  }

  /**
   * Handle delete group
   */
  async handleDeleteGroup(groupId) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除分组"${group.name}"吗？`,
      "确定",
      "取消"
    );
    
    if (confirm === "确定") {
      // Remove group
      this.groups = this.groups.filter(g => g.id !== groupId);
      
      // Save to config
      await saveStockGroups(this.groups);
      
      // Switch to "all" tab if current tab was deleted
      if (this.currentGroupId === groupId) {
        this.currentGroupId = 'all';
      }
      
      vscode.window.showInformationMessage(`分组"${group.name}"已删除`);
      
      // Trigger update
      if (this.updateCallback) {
        this.updateCallback();
      }
    }
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
    // Generate stock rows with checkboxes always visible
    const stockRows = stocks
      .map(
        (stock) => `
      <tr class="stock-row" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="checkbox-cell"><input type="checkbox" class="stock-checkbox" value="${this.escapeHtml(stock.code)}"></td>
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
    /* Divider */
    .divider {
      width: 1px;
      height: 20px;
      background-color: var(--vscode-panel-border);
      margin: 0 12px;
    }
    /* Management dropdown */
    .management-dropdown {
      position: relative;
      display: inline-block;
    }
    .management-button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
      transition: background-color 0.2s;
    }
    .management-button:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .management-button.active {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .dropdown-arrow {
      font-size: 10px;
      transition: transform 0.2s;
    }
    .management-button.active .dropdown-arrow {
      transform: rotate(180deg);
    }
    .dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background-color: var(--vscode-menu-background);
      border: 1px solid var(--vscode-menu-border);
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 140px;
      z-index: 1000;
      display: none;
    }
    .dropdown-menu.show {
      display: block;
    }
    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--vscode-menu-foreground);
      user-select: none;
      transition: background-color 0.1s;
    }
    .dropdown-item:hover {
      background-color: var(--vscode-menu-selectionBackground);
      color: var(--vscode-menu-selectionForeground);
    }
    .dropdown-item:first-child {
      border-radius: 3px 3px 0 0;
    }
    .dropdown-item:last-child {
      border-radius: 0 0 3px 3px;
    }
    .dropdown-icon {
      font-size: 14px;
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
    /* Checkbox column */
    .checkbox-cell {
      width: 40px !important;
      text-align: center !important;
      padding: 8px 4px !important;
    }
    .stock-checkbox {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }
    /* Remove mode action bar */
    .remove-action-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 8px;
    }
    .remove-info {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
    }
    .remove-actions {
      display: flex;
      gap: 8px;
    }
    .action-button {
      padding: 4px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 13px;
      transition: background-color 0.2s;
    }
    .action-button.confirm {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .action-button.confirm:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .action-button.confirm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .action-button.cancel {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .action-button.cancel:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    /* Group tabs */
    .group-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px 0 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      overflow-x: auto;
      overflow-y: hidden;
      white-space: nowrap;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background-color: var(--vscode-tab-inactiveBackground);
      color: var(--vscode-tab-inactiveForeground);
      border: 1px solid var(--vscode-tab-border);
      border-bottom: none;
      border-radius: 4px 4px 0 0;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
      transition: background-color 0.2s;
    }
    .tab:hover {
      background-color: var(--vscode-tab-hoverBackground);
    }
    .tab.active {
      background-color: var(--vscode-tab-activeBackground);
      color: var(--vscode-tab-activeForeground);
      border-bottom: 2px solid var(--vscode-tab-activeBorder, var(--vscode-focusBorder));
    }
    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      font-size: 16px;
      line-height: 1;
      opacity: 0.6;
      transition: opacity 0.2s, background-color 0.2s;
    }
    .tab-close:hover {
      opacity: 1;
      background-color: var(--vscode-toolbar-hoverBackground);
    }
    .tab-create {
      color: var(--vscode-textLink-foreground);
    }
    #contentArea {
      padding: 12px;
    }
    /* Create group form */
    .create-group-form {
      max-width: 500px;
      margin: 0 auto;
    }
    .create-group-form h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      font-weight: 600;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 500;
    }
    .form-group input[type="text"] {
      width: 100%;
      padding: 6px 10px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
    }
    .form-group input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .stock-selection {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      padding: 8px;
    }
    .stock-select-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      cursor: pointer;
    }
    .stock-select-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .stock-select-item input[type="checkbox"] {
      cursor: pointer;
    }
    .stock-select-item label {
      cursor: pointer;
      font-size: 13px;
      margin: 0;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
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
      <div class="divider"></div>
      <div class="management-dropdown">
        <button class="management-button" id="managementButton">
          ⚙️ 管理
          <span class="dropdown-arrow">▼</span>
        </button>
        <div class="dropdown-menu" id="dropdownMenu">
          <div class="dropdown-item" id="addStockItem">
            <span class="dropdown-icon">➕</span>
            <span>添加股票</span>
          </div>
          <div class="dropdown-item" id="createGroupItem">
            <span class="dropdown-icon">📁</span>
            <span>新建分组</span>
          </div>
        </div>
      </div>
    </div>
    <div class="remove-action-bar" id="removeActionBar" style="display: none;">
      <div class="remove-info">
        <span id="selectedCount">已选择 0 只股票</span>
      </div>
      <div class="remove-actions">
        <button class="action-button confirm" id="confirmRemoveBtn" disabled>确认移除</button>
        <button class="action-button cancel" id="cancelRemoveBtn">取消</button>
      </div>
    </div>
    ${this.getGroupTabsHtml()}
    <div id="contentArea">
      ${this.currentGroupId === 'create' ? this.getCreateGroupFormHtml() : this.getStockTableHtml(stocks)}
    </div>
  </div>
  ${this.getScriptContent()}
</body>
</html>`;
  }

  /**
   * Generate group tabs HTML
   */
  getGroupTabsHtml() {
    const allStocksCount = require("../config").getStocks().length;
    
    let tabsHtml = `
    <div class="group-tabs">
      <div class="tab ${this.currentGroupId === 'all' ? 'active' : ''}" data-group-id="all">
        全部 (${allStocksCount})
      </div>`;
    
    this.groups.forEach(group => {
      tabsHtml += `
      <div class="tab ${this.currentGroupId === group.id ? 'active' : ''}" data-group-id="${group.id}">
        ${this.escapeHtml(group.name)} (${group.stocks.length})
        <span class="tab-close" data-group-id="${group.id}">×</span>
      </div>`;
    });
    
    tabsHtml += `
      <div class="tab tab-create ${this.currentGroupId === 'create' ? 'active' : ''}" data-group-id="create">
        ➕ 新建
      </div>
    </div>`;
    
    return tabsHtml;
  }

  /**
   * Generate stock table HTML
   */
  getStockTableHtml(stocks) {
    // Filter stocks based on current group
    let displayStocks = stocks;
    if (this.currentGroupId !== 'all' && this.currentGroupId !== 'create') {
      const currentGroup = this.groups.find(g => g.id === this.currentGroupId);
      if (currentGroup) {
        displayStocks = stocks.filter(s => currentGroup.stocks.includes(s.code));
      }
    }
    
    const stockRows = displayStocks
      .map(
        (stock) => `
      <tr class="stock-row" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="checkbox-cell"><input type="checkbox" class="stock-checkbox" value="${this.escapeHtml(stock.code)}"></td>
        <td class="stock-name">${this.escapeHtml(stock.name)}</td>
        <td class="stock-code">${this.escapeHtml(stock.code)}</td>
        <td class="stock-price ${this.isColorModeEnabled ? (stock.isUp ? "up" : "down") : ""}">${this.escapeHtml(
          stock.price
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
    
    return `
    <table>
      <thead>
        <tr>
          <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox"></th>
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
    </table>`;
  }

  /**
   * Generate create group form HTML
   */
  getCreateGroupFormHtml() {
    const { getStocks } = require("../config");
    const allStocks = getStocks();
    const { getStockList } = require("../services/stockService");
    
    return `
    <div class="create-group-form">
      <h3>新建分组</h3>
      <div class="form-group">
        <label for="groupName">分组名称:</label>
        <input type="text" id="groupName" placeholder="例如: 光伏概念" />
      </div>
      <div class="form-group">
        <label>选择股票:</label>
        <div class="stock-selection">
          ${allStocks.map(code => `
            <div class="stock-select-item">
              <input type="checkbox" class="group-stock-checkbox" value="${this.escapeHtml(code)}" id="stock-${this.escapeHtml(code)}">
              <label for="stock-${this.escapeHtml(code)}">${this.escapeHtml(code)}</label>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="form-actions">
        <button class="action-button cancel" id="cancelCreateBtn">取消</button>
        <button class="action-button confirm" id="saveGroupBtn">保存</button>
      </div>
    </div>`;
  }

  /**
   * Generate script content
   */
  getScriptContent() {
    return `<script>
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
    
    // Handle management dropdown
    const managementButton = document.getElementById('managementButton');
    const dropdownMenu = document.getElementById('dropdownMenu');
    
    managementButton.addEventListener('click', (e) => {
      e.stopPropagation();
      managementButton.classList.toggle('active');
      dropdownMenu.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      if (dropdownMenu.classList.contains('show')) {
        managementButton.classList.remove('active');
        dropdownMenu.classList.remove('show');
      }
    });
    
    // Handle dropdown items
    document.getElementById('addStockItem').addEventListener('click', () => {
      vscode.postMessage({ command: 'addStock' });
      managementButton.classList.remove('active');
      dropdownMenu.classList.remove('show');
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
    
    // Handle checkboxes and dynamic action bar
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const stockCheckboxes = document.querySelectorAll('.stock-checkbox');
    const confirmRemoveBtn = document.getElementById('confirmRemoveBtn');
    const cancelRemoveBtn = document.getElementById('cancelRemoveBtn');
    const selectedCountSpan = document.getElementById('selectedCount');
    const removeActionBar = document.getElementById('removeActionBar');
    
    function updateRemoveUI() {
      const checkedBoxes = document.querySelectorAll('.stock-checkbox:checked');
      const count = checkedBoxes.length;
      
      // Show/hide action bar based on selection
      if (removeActionBar) {
        removeActionBar.style.display = count > 0 ? 'flex' : 'none';
      }
      
      if (selectedCountSpan) {
        selectedCountSpan.textContent = \`已选择 \${count} 只股票\`;
      }
      
      if (confirmRemoveBtn) {
        confirmRemoveBtn.disabled = count === 0;
      }
      
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = count === stockCheckboxes.length && count > 0;
        selectAllCheckbox.indeterminate = count > 0 && count < stockCheckboxes.length;
      }
    }
    
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        stockCheckboxes.forEach(cb => {
          cb.checked = e.target.checked;
        });
        updateRemoveUI();
      });
    }
    
    stockCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        updateRemoveUI();
      });
    });
    
    if (confirmRemoveBtn) {
      confirmRemoveBtn.addEventListener('click', () => {
        const checkedBoxes = document.querySelectorAll('.stock-checkbox:checked');
        const codes = Array.from(checkedBoxes).map(cb => cb.value);
        console.log('[CodeTrader] Confirm remove clicked, codes:', codes);
        vscode.postMessage({
          command: 'confirmRemove',
          codes: codes
        });
      });
    }
    
    if (cancelRemoveBtn) {
      cancelRemoveBtn.addEventListener('click', () => {
        // Uncheck all checkboxes
        stockCheckboxes.forEach(cb => {
          cb.checked = false;
        });
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = false;
        }
        updateRemoveUI();
      });
    }
    
    // 监听股票行点击事件，点击行切换复选框
    document.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // Clicking row toggles checkbox (unless clicking the checkbox itself)
        if (e.target.type !== 'checkbox') {
          const checkbox = row.querySelector('.stock-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            updateRemoveUI();
          }
        }
      });
      
      // 添加鼠标悬停效果提示
      row.style.cursor = 'pointer';
    });
    
    // Handle group tabs
    document.querySelectorAll('.tab:not(.tab-close)').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          const groupId = tab.dataset.groupId;
          vscode.postMessage({
            command: 'switchGroup',
            groupId: groupId
          });
        }
      });
    });
    
    // Handle tab close buttons
    document.querySelectorAll('.tab-close').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = closeBtn.dataset.groupId;
        vscode.postMessage({
          command: 'deleteGroup',
          groupId: groupId
        });
      });
    });
    
    // Handle create group item in dropdown
    const createGroupItem = document.getElementById('createGroupItem');
    if (createGroupItem) {
      createGroupItem.addEventListener('click', () => {
        vscode.postMessage({ command: 'switchGroup', groupId: 'create' });
        managementButton.classList.remove('active');
        dropdownMenu.classList.remove('show');
      });
    }
    
    // Handle create group form
    const saveGroupBtn = document.getElementById('saveGroupBtn');
    const cancelCreateBtn = document.getElementById('cancelCreateBtn');
    const groupNameInput = document.getElementById('groupName');
    
    if (saveGroupBtn) {
      saveGroupBtn.addEventListener('click', () => {
        const groupName = groupNameInput.value.trim();
        if (!groupName) {
          alert('请输入分组名称');
          return;
        }
        
        const selectedStocks = Array.from(document.querySelectorAll('.group-stock-checkbox:checked'))
          .map(cb => cb.value);
        
        if (selectedStocks.length === 0) {
          alert('请至少选择一只股票');
          return;
        }
        
        vscode.postMessage({
          command: 'createGroup',
          name: groupName,
          stocks: selectedStocks
        });
      });
    }
    
    if (cancelCreateBtn) {
      cancelCreateBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'switchGroup', groupId: 'all' });
      });
    }
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
