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
    this.currentGroupId = 'all'; // Current active group tab ('all' or group id or 'create' or 'add-to-group-{groupId}')
    this.selectedStockCodes = new Set(); // Track selected stock codes across refreshes
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

    const { getStockGroups } = require("../config");
    this.groups = getStockGroups();

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
    
    const prevCount = this.currentStockInfos.length;
    const prevCodes = new Set(this.currentStockInfos.map(s => s.code));

    // 保存当前股票信息，用于悬浮框显示
    this.currentStockInfos = stockInfos;
    
    // 如果悬浮框已显示，更新内容
    if (this.hoverPanel) {
      const codesChanged = stockInfos.length !== prevCount ||
        stockInfos.some(s => !prevCodes.has(s.code));
      if (codesChanged) {
        this.updateHoverPanelContent(stockInfos);
      } else {
        this.updateStockDataOnly(stockInfos);
      }
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
        if (this.stockManager && this.updateCallback) {
          this.stockManager.addStock(this.updateCallback, this.currentGroupId);
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
        await this.handleDeleteGroup(message.groupId, message.skipConfirm);
      } else if (message.command === "addToGroupById") {
        // Add stocks to specific group
        await this.handleAddToGroupById(message.groupId);
      } else if (message.command === "renameGroup") {
        // Rename group
        await this.handleRenameGroup(message.groupId, message.newName);
      } else if (message.command === "saveToGroup") {
        // Save stocks to existing group
        await this.handleSaveToGroup(message.groupId, message.stocks);
      } else if (message.command === "reorderGroups") {
        // Reorder groups
        await this.handleReorderGroups(message.groupIds);
      } else if (message.command === "setStocksGroup") {
        // Set stocks to a group
        await this.handleSetStocksGroup(message.codes, message.targetGroupId);
      } else if (message.command === "moveStocksToGroup") {
        // Move stocks to a group
        await this.handleMoveStocksToGroup(message.codes, message.targetGroupId);
      } else if (message.command === "togglePin") {
        await this.handleTogglePin(message.codes);
      }
    });
  }

  /**
   * Handle batch remove stocks
   */
  async handleBatchRemove(codes) {
    const vscode = require("vscode");
    
    // If in a group (not "all"), only remove from group
    if (this.currentGroupId !== 'all' && this.currentGroupId !== 'create') {
      const { saveStockGroups } = require("../config");
      const currentGroup = this.groups.find(g => g.id === this.currentGroupId);
      
      if (currentGroup) {
        // Remove stocks from group
        currentGroup.stocks = currentGroup.stocks.filter(s => !codes.includes(s));
        await saveStockGroups(this.groups);
        vscode.window.showInformationMessage(`已从分组"${currentGroup.name}"中移除 ${codes.length} 只股票`);
      }
    } else {
      // If in "all" tab, remove from global stock list
      const { getStocks, saveStocks } = require("../config");
      const stocks = getStocks();
      const newStocks = stocks.filter(s => !codes.includes(s));
      await saveStocks(newStocks);
      vscode.window.showInformationMessage(`已移除 ${codes.length} 只股票`);
    }
    
    // Clear selected stock codes after removal
    this.selectedStockCodes.clear();
    
    // Trigger update
    if (this.updateCallback) {
      await this.updateCallback();
    }
    
    // Force full re-render to immediately show removed stocks
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Handle create group
   */
  async handleCreateGroup(name, stocks) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    console.log('[CodeTrader] Creating group:', name, 'with stocks:', stocks);
    
    // Check for duplicate name
    const existingGroup = this.groups.find(g => g.name === name);
    if (existingGroup) {
      // Send error message to webview to show in-page alert
      if (this.hoverPanel) {
        this.hoverPanel.webview.postMessage({
          command: 'showError',
          message: `分组名称"${name}"已存在，请使用其他名称`
        });
      }
      return;
    }
    
    // Generate unique ID
    const groupId = 'group-' + Date.now();
    
    // Add new group
    this.groups.push({
      id: groupId,
      name: name,
      stocks: stocks
    });
    
    console.log('[CodeTrader] Group added, switching to:', groupId);
    
    // Switch to the new group BEFORE saving and updating
    this.currentGroupId = groupId;
    
    // Save to config
    await saveStockGroups(this.groups);
    
    console.log('[CodeTrader] Group saved, triggering update');
    
    vscode.window.showInformationMessage(`分组"${name}"创建成功`);
    
    // Trigger update - this will refresh the panel with the new group
    if (this.updateCallback) {
      await this.updateCallback();
    }
    
    // Force full re-render to show new group tab
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
    
    console.log('[CodeTrader] Update completed, currentGroupId:', this.currentGroupId);
  }

  /**
   * Handle delete group
   */
  async handleDeleteGroup(groupId, skipConfirm = false) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      console.log('[CodeTrader] Group not found:', groupId);
      return;
    }
    
    console.log('[CodeTrader] Deleting group:', group.name, 'skipConfirm:', skipConfirm);
    
    // If skipConfirm is true, delete directly (already confirmed in webview)
    // Otherwise, show confirmation dialog
    let shouldDelete = skipConfirm;
    
    if (!skipConfirm) {
      const confirm = await vscode.window.showWarningMessage(
        `确定要删除分组"${group.name}"吗？`,
        "确定",
        "取消"
      );
      shouldDelete = confirm === "确定";
    }
    
    if (shouldDelete) {
      console.log('[CodeTrader] Proceeding with deletion');
      
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
        await this.updateCallback();
      }
      
      // Force full re-render to update group tabs
      if (this.hoverPanel && this.currentStockInfos) {
        this.updateHoverPanelContent(this.currentStockInfos);
      }
      
      console.log('[CodeTrader] Group deleted successfully');
    } else {
      console.log('[CodeTrader] Deletion cancelled');
    }
  }

  /**
   * Handle add stocks to specific group by ID
   */
  async handleAddToGroupById(groupId) {
    const vscode = require("vscode");
    
    // Find the group
    const targetGroup = this.groups.find(g => g.id === groupId);
    if (!targetGroup) {
      vscode.window.showErrorMessage('分组不存在');
      return;
    }
    
    // Switch to add-to-group view
    this.currentGroupId = `add-to-group-${groupId}`;
    this.updateHoverPanelContent(this.currentStockInfos);
  }
  
  /**
   * Handle save stocks to existing group
   */
  async handleSaveToGroup(groupId, stockCodes) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    const targetGroup = this.groups.find(g => g.id === groupId);
    if (!targetGroup) {
      vscode.window.showErrorMessage('分组不存在');
      return;
    }
    
    if (stockCodes.length === 0) {
      vscode.window.showWarningMessage('请至少选择一只股票');
      return;
    }
    
    // Add stocks to group (avoid duplicates)
    const newStocks = stockCodes.filter(code => !targetGroup.stocks.includes(code));
    if (newStocks.length === 0) {
      vscode.window.showInformationMessage('所选股票已在该分组中');
      this.currentGroupId = groupId;
      if (this.updateCallback) {
        await this.updateCallback();
      }
      return;
    }
    
    targetGroup.stocks.push(...newStocks);
    
    // Save
    await saveStockGroups(this.groups);
    
    vscode.window.showInformationMessage(`已向分组"${targetGroup.name}"添加 ${newStocks.length} 只股票`);
    
    // Switch back to the group tab
    this.currentGroupId = groupId;
    
    // Trigger update
    if (this.updateCallback) {
      await this.updateCallback();
    }
    
    // Force full re-render to show updated group
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Handle reorder groups
   */
  async handleReorderGroups(groupIds) {
    const { saveStockGroups } = require("../config");
    
    // Reorder groups array based on groupIds
    const reorderedGroups = [];
    groupIds.forEach(id => {
      const group = this.groups.find(g => g.id === id);
      if (group) {
        reorderedGroups.push(group);
      }
    });
    
    // Add any groups that weren't in the list (shouldn't happen, but safety check)
    this.groups.forEach(group => {
      if (!reorderedGroups.find(g => g.id === group.id)) {
        reorderedGroups.push(group);
      }
    });
    
    this.groups = reorderedGroups;
    await saveStockGroups(this.groups);
    
    // Trigger update
    if (this.updateCallback) {
      await this.updateCallback();
    }
    
    // Force full re-render to show reordered tabs
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Handle rename group
   */
  async handleRenameGroup(groupId, newName) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    // Find the group
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      vscode.window.showErrorMessage('分组不存在');
      return;
    }
    
    // Check for duplicate name
    const existingGroup = this.groups.find(g => g.id !== groupId && g.name === newName);
    if (existingGroup) {
      // Send error message to webview to show in-page alert
      if (this.hoverPanel) {
        this.hoverPanel.webview.postMessage({
          command: 'showError',
          message: `分组名称"${newName}"已存在，请使用其他名称`
        });
      }
      return;
    }
    
    const oldName = group.name;
    group.name = newName;
    
    // Save
    await saveStockGroups(this.groups);
    
    vscode.window.showInformationMessage(`分组已重命名：${oldName} → ${newName}`);
    
    // Trigger update
    if (this.updateCallback) {
      this.updateCallback();
    }
    
    // Force full re-render to show updated group name
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Handle set stocks to a group
   */
  async handleSetStocksGroup(codes, targetGroupId) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    const targetGroup = this.groups.find(g => g.id === targetGroupId);
    
    if (!targetGroup) {
      vscode.window.showErrorMessage('分组不存在');
      return;
    }
    
    // Add stocks to group (avoid duplicates)
    const newStocks = codes.filter(code => !targetGroup.stocks.includes(code));
    if (newStocks.length > 0) {
      targetGroup.stocks.push(...newStocks);
      await saveStockGroups(this.groups);
      vscode.window.showInformationMessage(`已将 ${codes.length} 只股票添加到"${targetGroup.name}"`);
    }
    // If all stocks already in group, silent handling
    
    // Clear selected stock codes
    this.selectedStockCodes.clear();
    
    // Send message to frontend to clear checkbox selections
    if (this.hoverPanel) {
      this.hoverPanel.webview.postMessage({
        command: 'clearSelections'
      });
    }
    
    // Trigger update
    if (this.updateCallback) {
      await this.updateCallback();
    }
  }

  /**
   * Handle move stocks to a group
   */
  async handleMoveStocksToGroup(codes, targetGroupId) {
    const { saveStockGroups } = require("../config");
    const vscode = require("vscode");
    
    const currentGroup = this.groups.find(g => g.id === this.currentGroupId);
    const targetGroup = this.groups.find(g => g.id === targetGroupId);
    
    if (!currentGroup || !targetGroup) {
      vscode.window.showErrorMessage('分组不存在');
      return;
    }
    
    // Remove from current group
    currentGroup.stocks = currentGroup.stocks.filter(s => !codes.includes(s));
    
    // Add to target group (avoid duplicates)
    const newStocks = codes.filter(code => !targetGroup.stocks.includes(code));
    if (newStocks.length > 0) {
      targetGroup.stocks.push(...newStocks);
    }
    
    // Save
    await saveStockGroups(this.groups);
    
    vscode.window.showInformationMessage(`已将 ${codes.length} 只股票移动到"${targetGroup.name}"`);
    
    // Clear selections
    this.selectedStockCodes.clear();
    
    // Send message to frontend to clear checkbox selections
    if (this.hoverPanel) {
      this.hoverPanel.webview.postMessage({
        command: 'clearSelections'
      });
    }
    
    // Trigger update
    if (this.updateCallback) {
      await this.updateCallback();
    }
    
    // Force full re-render to show removed stocks
    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Get pinned stock codes for the current view as a Set
   */
  getPinnedSet() {
    if (this.currentGroupId === 'all') {
      const { getPinnedStocks } = require("../config");
      return new Set(getPinnedStocks());
    }
    const group = this.groups.find(g => g.id === this.currentGroupId);
    return new Set(group?.pinnedStocks || []);
  }

  /**
   * Toggle pin state for given stock codes
   */
  async handleTogglePin(codes) {
    if (this.currentGroupId === 'all') {
      const { getPinnedStocks, savePinnedStocks } = require("../config");
      const pinned = getPinnedStocks();
      const pinnedSet = new Set(pinned);
      const allPinned = codes.every(c => pinnedSet.has(c));
      let newPinned;
      if (allPinned) {
        newPinned = pinned.filter(c => !codes.includes(c));
      } else {
        newPinned = [...pinned, ...codes.filter(c => !pinnedSet.has(c))];
      }
      await savePinnedStocks(newPinned);
    } else {
      const { saveStockGroups } = require("../config");
      const group = this.groups.find(g => g.id === this.currentGroupId);
      if (!group) return;
      if (!group.pinnedStocks) group.pinnedStocks = [];
      const pinnedSet = new Set(group.pinnedStocks);
      const allPinned = codes.every(c => pinnedSet.has(c));
      if (allPinned) {
        group.pinnedStocks = group.pinnedStocks.filter(c => !codes.includes(c));
      } else {
        group.pinnedStocks = [...group.pinnedStocks, ...codes.filter(c => !pinnedSet.has(c))];
      }
      await saveStockGroups(this.groups);
    }

    if (this.hoverPanel && this.currentStockInfos) {
      this.updateHoverPanelContent(this.currentStockInfos);
    }
  }

  /**
   * Sort stocks: pinned first (preserve order), then normal stocks sorted by column
   */
  sortWithPinning(stockInfos) {
    const pinnedSet = this.getPinnedSet();
    const pinnedOrder = [...pinnedSet];
    const pinned = pinnedOrder
      .map(code => stockInfos.find(s => s.code === code))
      .filter(Boolean);
    let normal = stockInfos.filter(s => !pinnedSet.has(s.code));

    if (this.sortColumn) {
      normal = [...normal].sort((a, b) => {
        let aVal, bVal;
        if (this.sortColumn === 'price') {
          aVal = parseFloat(a.current); bVal = parseFloat(b.current);
        } else if (this.sortColumn === 'change') {
          aVal = parseFloat(a.change); bVal = parseFloat(b.change);
        } else if (this.sortColumn === 'changePercent') {
          aVal = parseFloat(a.changePercent); bVal = parseFloat(b.changePercent);
        }
        return this.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    return [...pinned, ...normal];
  }

  /**
   * 更新悬浮框内容
   */
  updateHoverPanelContent(stockInfos) {
    console.log('[CodeTrader] updateHoverPanelContent called, currentGroupId:', this.currentGroupId, 'stockInfos length:', stockInfos ? stockInfos.length : 0);
    
    if (!this.hoverPanel) {
      console.log('[CodeTrader] No hover panel, skipping update');
      return;
    }

    const displayStocks = this.sortWithPinning(stockInfos);

    const html = this.getHoverPanelHtml(displayStocks);
    console.log('[CodeTrader] Setting new HTML, currentGroupId:', this.currentGroupId);
    this.hoverPanel.webview.html = html;
    console.log('[CodeTrader] HTML updated');
  }
  
  /**
   * Update stock data without re-rendering (preserves checkbox states)
   */
  updateStockDataOnly(stockInfos) {
    if (!this.hoverPanel) {
      return;
    }
    
    let displayStocks = this.sortWithPinning(stockInfos);
    
    // Filter by current group
    if (this.currentGroupId !== 'all' && this.currentGroupId !== 'create' && !this.currentGroupId.startsWith('add-to-group-')) {
      const currentGroup = this.groups.find(g => g.id === this.currentGroupId);
      if (currentGroup) {
        displayStocks = displayStocks.filter(s => currentGroup.stocks.includes(s.code));
      }
    }
    
    // Send data update message to preserve checkbox states
    this.hoverPanel.webview.postMessage({
      command: 'updateStockData',
      stocks: displayStocks,
      isColorModeEnabled: this.isColorModeEnabled
    });
  }

  /**
   * 生成悬浮框 HTML
   */
  getHoverPanelHtml(stocks) {
    const pinnedSet = this.getPinnedSet();
    const stockRows = stocks
      .map(
        (stock) => {
          const isPinned = pinnedSet.has(stock.code);
          return `
      <tr class="stock-row${isPinned ? ' pinned' : ''}" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="checkbox-cell"><input type="checkbox" class="stock-checkbox" value="${this.escapeHtml(stock.code)}"></td>
        <td class="stock-name">${isPinned ? '<span class="pin-icon">📌</span>' : ''}${this.escapeHtml(stock.name)}</td>
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
    `;
        }
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
    .spacer {
      flex: 1;
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
    .stock-row.pinned {
      background-color: rgba(255, 152, 0, 0.08);
      border-left: 3px solid #ff9800;
    }
    .stock-row.pinned:hover {
      background-color: rgba(255, 152, 0, 0.15);
    }
    .stock-row.pinned:last-of-type {
      border-bottom: 2px solid rgba(255, 152, 0, 0.3);
    }
    .stock-row:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .pin-icon {
      font-size: 10px;
      margin-right: 3px;
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
    /* Drag selecting state */
    .hover-container.drag-selecting {
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    .hover-container.drag-selecting * {
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
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
    .tab.dragging {
      opacity: 0.5;
    }
    .tab-close {
      display: none;
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
    .tab:hover .tab-close {
      display: inline-flex;
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
    /* Confirmation dialog */
    .confirm-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .confirm-dialog-overlay.show {
      display: flex;
    }
    .confirm-dialog {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 20px;
      min-width: 300px;
      max-width: 500px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .confirm-dialog-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-foreground);
    }
    .confirm-dialog-message {
      font-size: 13px;
      margin-bottom: 20px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
    .confirm-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    /* Context menu for tabs */
    .context-menu {
      position: fixed;
      background-color: var(--vscode-menu-background);
      border: 1px solid var(--vscode-menu-border);
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 140px;
      z-index: 10001;
      display: none;
    }
    .context-menu.show {
      display: block;
    }
    .context-menu-item {
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
    .context-menu-item:hover {
      background-color: var(--vscode-menu-selectionBackground);
      color: var(--vscode-menu-selectionForeground);
    }
    .context-menu-item:first-child {
      border-radius: 3px 3px 0 0;
    }
    .context-menu-item:last-child {
      border-radius: 0 0 3px 3px;
    }
    .context-menu-icon {
      font-size: 14px;
    }
    /* Submenu styles */
    .context-menu-item.has-submenu {
      position: relative;
      padding-right: 24px;
    }
    .context-menu-item.has-submenu::after {
      content: '▶';
      position: absolute;
      right: 8px;
      font-size: 10px;
      opacity: 0.6;
    }
    .context-submenu {
      position: absolute;
      left: 100%;
      top: -1px;
      margin-left: 2px;
      background-color: var(--vscode-menu-background);
      border: 1px solid var(--vscode-menu-border);
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 120px;
      z-index: 10002;
      display: none;
    }
    .context-submenu.show {
      display: block;
    }
    /* Rename input dialog */
    .rename-dialog {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 20px;
      min-width: 300px;
      max-width: 400px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .rename-dialog input {
      width: 100%;
      padding: 6px 10px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      margin-bottom: 16px;
    }
    .rename-dialog input:focus {
      outline: 1px solid var(--vscode-focusBorder);
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
      <div class="spacer"></div>
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
      ${this.getContentHtml(stocks)}
    </div>
  </div>
  <div class="confirm-dialog-overlay" id="confirmDialogOverlay">
    <div class="confirm-dialog">
      <div class="confirm-dialog-title" id="confirmDialogTitle">确认操作</div>
      <div class="confirm-dialog-message" id="confirmDialogMessage">确定要执行此操作吗？</div>
      <div class="confirm-dialog-actions">
        <button class="action-button cancel" id="confirmDialogCancel">取消</button>
        <button class="action-button confirm" id="confirmDialogConfirm">确定</button>
      </div>
    </div>
  </div>
  <div class="confirm-dialog-overlay" id="renameDialogOverlay">
    <div class="rename-dialog">
      <div class="confirm-dialog-title">重命名分组</div>
      <input type="text" id="renameInput" placeholder="输入新的分组名称" />
      <div class="confirm-dialog-actions">
        <button class="action-button cancel" id="renameDialogCancel">取消</button>
        <button class="action-button confirm" id="renameDialogConfirm">确定</button>
      </div>
    </div>
  </div>
  <div class="context-menu" id="tabContextMenu">
    <div class="context-menu-item" id="contextRename">
      <span class="context-menu-icon">✏️</span>
      <span>重命名</span>
    </div>
    <div class="context-menu-item" id="contextAddStock">
      <span class="context-menu-icon">➕</span>
      <span>添加股票</span>
    </div>
    <div class="context-menu-item" id="contextDelete">
      <span class="context-menu-icon">🗑️</span>
      <span>删除分组</span>
    </div>
  </div>
  <div class="context-menu" id="stockRowContextMenu">
    ${this.currentGroupId === 'all' ? `
    <div class="context-menu-item has-submenu" id="stockContextSetGroup">
      <span class="context-menu-icon">📁</span>
      <span>设置分组</span>
      <div class="context-submenu" id="setGroupSubmenu"></div>
    </div>
    ` : ''}
    ${this.currentGroupId !== 'all' && this.currentGroupId !== 'create' ? `
    <div class="context-menu-item has-submenu" id="stockContextMoveToGroup">
      <span class="context-menu-icon">📤</span>
      <span>移动到</span>
      <div class="context-submenu" id="moveToSubmenu"></div>
    </div>
    ` : ''}
    <div class="context-menu-item" id="stockContextPin">
      <span class="context-menu-icon" id="stockContextPinIcon">📌</span>
      <span id="stockContextPinLabel">置顶</span>
    </div>
    <div class="context-menu-item" id="stockContextDelete">
      <span class="context-menu-icon">🗑️</span>
      <span>${this.currentGroupId !== 'all' && this.currentGroupId !== 'create' ? '从当前分组移除' : '删除'}</span>
    </div>
  </div>
  ${this.getScriptContent()}
</body>
</html>`;
  }

  /**
   * Get content HTML based on current group ID
   */
  getContentHtml(stocks) {
    if (this.currentGroupId === 'create') {
      return this.getCreateGroupFormHtml();
    } else if (this.currentGroupId.startsWith('add-to-group-')) {
      const groupId = this.currentGroupId.replace('add-to-group-', '');
      return this.getAddToGroupFormHtml(groupId);
    } else {
      return this.getStockTableHtml(stocks);
    }
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
        ${this.escapeHtml(group.name)}
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
    
    const pinnedSet = this.getPinnedSet();
    const stockRows = displayStocks
      .map(
        (stock) => {
          const isPinned = pinnedSet.has(stock.code);
          return `
      <tr class="stock-row${isPinned ? ' pinned' : ''}" data-code="${this.escapeHtml(stock.code)}" data-name="${this.escapeHtml(stock.name)}">
        <td class="checkbox-cell"><input type="checkbox" class="stock-checkbox" value="${this.escapeHtml(stock.code)}"></td>
        <td class="stock-name">${isPinned ? '<span class="pin-icon">📌</span>' : ''}${this.escapeHtml(stock.name)}</td>
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
    `;
        }
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
   * Generate add to group form HTML
   */
  getAddToGroupFormHtml(groupId) {
    const targetGroup = this.groups.find(g => g.id === groupId);
    if (!targetGroup) {
      return '<div style="padding: 20px; text-align: center;">分组不存在</div>';
    }
    
    // Get stocks not in the group
    const { getStocks } = require("../config");
    const allStocks = getStocks();
    const availableStockCodes = allStocks.filter(code => !targetGroup.stocks.includes(code));
    
    let stockItems = '';
    
    if (this.currentStockInfos && this.currentStockInfos.length > 0 && availableStockCodes.length > 0) {
      const availableStockInfos = this.currentStockInfos.filter(s => availableStockCodes.includes(s.code));
      stockItems = availableStockInfos.map(stock => `
        <div class="stock-select-item">
          <input type="checkbox" class="group-stock-checkbox" value="${this.escapeHtml(stock.code)}" id="stock-${this.escapeHtml(stock.code)}">
          <label for="stock-${this.escapeHtml(stock.code)}">${this.escapeHtml(stock.name)} (${this.escapeHtml(stock.code)})</label>
        </div>
      `).join('');
    } else if (availableStockCodes.length === 0) {
      stockItems = '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">所有股票都已在该分组中</div>';
    } else {
      stockItems = '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">加载中...</div>';
    }
    
    return `
    <div class="create-group-form">
      <h3>添加股票到"${this.escapeHtml(targetGroup.name)}"</h3>
      <div class="form-group">
        <label>选择股票:</label>
        <div style="margin-bottom: 8px;">
          <input type="text" id="addToGroupSearch" placeholder="搜索股票名称或代码..." style="
            width: 100%;
            box-sizing: border-box;
            padding: 6px 10px;
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            background: var(--vscode-input-background, #1e1e1e);
            color: var(--vscode-input-foreground, #ccc);
            border-radius: 4px;
            font-size: 12px;
            outline: none;
          ">
        </div>
        <div class="stock-selection" id="stockSelection">
          ${stockItems}
        </div>
      </div>
      <div class="form-actions">
        <button class="action-button cancel" id="cancelAddToGroupBtn">取消</button>
        <button class="action-button confirm" id="saveToGroupBtn" data-group-id="${groupId}">保存</button>
      </div>
    </div>`;
  }

  /**
   * Generate create group form HTML
   */
  getCreateGroupFormHtml() {
    // Use currentStockInfos to show stock names
    let stockItems = '';
    
    console.log('[CodeTrader] getCreateGroupFormHtml - currentStockInfos length:', this.currentStockInfos ? this.currentStockInfos.length : 0);
    
    if (this.currentStockInfos && this.currentStockInfos.length > 0) {
      stockItems = this.currentStockInfos.map(stock => `
        <div class="stock-select-item">
          <input type="checkbox" class="group-stock-checkbox" value="${this.escapeHtml(stock.code)}" id="stock-${this.escapeHtml(stock.code)}">
          <label for="stock-${this.escapeHtml(stock.code)}">${this.escapeHtml(stock.name)} (${this.escapeHtml(stock.code)})</label>
        </div>
      `).join('');
      console.log('[CodeTrader] Generated stock items for', this.currentStockInfos.length, 'stocks');
    } else {
      stockItems = '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">加载中...</div>';
      console.log('[CodeTrader] No stock info available, showing loading message');
    }
    
    return `
    <div class="create-group-form">
      <h3>新建分组</h3>
      <div class="form-group">
        <label for="groupName">分组名称:</label>
        <input type="text" id="groupName" placeholder="例如: 光伏概念" autofocus />
      </div>
      <div class="form-group">
        <label>选择股票:</label>
        <div class="stock-selection" id="stockSelection">
          ${stockItems}
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
    
    // Preserve checkbox states across refreshes
    let savedCheckboxStates = ${JSON.stringify(Array.from(this.selectedStockCodes))};
    
    // Pinned stocks for current view
    const pinnedStocksSet = new Set(${JSON.stringify(Array.from(this.getPinnedSet()))});
    
    // Function to clear all selections (defined early)
    function clearAllSelections() {
      const allCheckboxes = document.querySelectorAll('.stock-checkbox');
      allCheckboxes.forEach(cb => {
        cb.checked = false;
      });
      const selectAll = document.getElementById('selectAllCheckbox');
      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }
      savedCheckboxStates = [];
      
      // Update UI if updateRemoveUI is available
      if (typeof updateRemoveUI === 'function') {
        updateRemoveUI();
      }
    }
    
    // Listen for messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateStockData') {
        // Update stock data without re-rendering entire page
        updateStockTableData(message.stocks, message.isColorModeEnabled);
      } else if (message.command === 'showError') {
        // Show error message in page
        showErrorDialog(message.message);
      } else if (message.command === 'clearSelections') {
        // Clear all checkbox selections
        clearAllSelections();
      }
    });
    
    // Function to update stock table data
    function updateStockTableData(stocks, isColorModeEnabled) {
      const tbody = document.querySelector('table tbody');
      if (!tbody) return;
      
      // Save current checkbox states
      const checkedBoxes = document.querySelectorAll('.stock-checkbox:checked');
      const checkedCodes = Array.from(checkedBoxes).map(cb => cb.value);
      savedCheckboxStates = checkedCodes;
      
      // Update each row's data
      stocks.forEach(stock => {
        const row = tbody.querySelector(\`tr[data-code="\${stock.code}"]\`);
        if (row) {
          // Update price
          const priceCell = row.querySelector('.stock-price');
          if (priceCell) {
            priceCell.textContent = stock.current;
            priceCell.className = 'stock-price';
            if (isColorModeEnabled) {
              priceCell.classList.add(stock.isUp ? 'up' : 'down');
            }
          }
          
          // Update change
          const changeCell = row.querySelector('.stock-change');
          if (changeCell) {
            changeCell.textContent = (stock.change >= 0 ? '+' : '') + stock.change;
            changeCell.className = 'stock-change';
            if (isColorModeEnabled) {
              changeCell.classList.add(stock.isUp ? 'up' : 'down');
            }
          }
          
          // Update change percent
          const percentCell = row.querySelector('.stock-percent');
          if (percentCell) {
            percentCell.textContent = (stock.changePercent >= 0 ? '+' : '') + stock.changePercent + '%';
            percentCell.className = 'stock-percent';
            if (isColorModeEnabled) {
              percentCell.classList.add(stock.isUp ? 'up' : 'down');
            }
          }
          
          // Restore checkbox state
          const checkbox = row.querySelector('.stock-checkbox');
          if (checkbox && checkedCodes.includes(stock.code)) {
            checkbox.checked = true;
          }
        }
      });
      
      // Update remove UI to reflect current state
      if (typeof updateRemoveUI === 'function') {
        updateRemoveUI();
      }
    }
    
    // Restore checkbox states after DOM is ready
    function restoreCheckboxStates() {
      if (savedCheckboxStates && savedCheckboxStates.length > 0) {
        savedCheckboxStates.forEach(code => {
          const checkbox = document.querySelector(\`.stock-checkbox[value="\${code}"]\`);
          if (checkbox) {
            checkbox.checked = true;
          }
        });
        updateRemoveUI();
      }
    }
    
    // Call restore after a short delay to ensure DOM is ready
    setTimeout(restoreCheckboxStates, 50);
    
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
    let dropdownHideTimeout = null;
    
    managementButton.addEventListener('click', (e) => {
      e.stopPropagation();
      managementButton.classList.toggle('active');
      dropdownMenu.classList.toggle('show');
    });
    
    // Auto-hide dropdown on mouse leave with delay
    dropdownMenu.addEventListener('mouseenter', () => {
      if (dropdownHideTimeout) {
        clearTimeout(dropdownHideTimeout);
        dropdownHideTimeout = null;
      }
    });
    
    dropdownMenu.addEventListener('mouseleave', () => {
      dropdownHideTimeout = setTimeout(() => {
        managementButton.classList.remove('active');
        dropdownMenu.classList.remove('show');
      }, 500);
    });
    
    // Also hide on button mouse leave (when menu is open)
    managementButton.addEventListener('mouseleave', () => {
      if (dropdownMenu.classList.contains('show')) {
        dropdownHideTimeout = setTimeout(() => {
          managementButton.classList.remove('active');
          dropdownMenu.classList.remove('show');
        }, 500);
      }
    });
    
    // Cancel hide when mouse enters button
    managementButton.addEventListener('mouseenter', () => {
      if (dropdownHideTimeout) {
        clearTimeout(dropdownHideTimeout);
        dropdownHideTimeout = null;
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      if (dropdownMenu.classList.contains('show')) {
        managementButton.classList.remove('active');
        dropdownMenu.classList.remove('show');
        if (dropdownHideTimeout) {
          clearTimeout(dropdownHideTimeout);
          dropdownHideTimeout = null;
        }
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
      const allCheckboxes = document.querySelectorAll('.stock-checkbox');
      const count = checkedBoxes.length;
      
      // Update saved checkbox states
      savedCheckboxStates = Array.from(checkedBoxes).map(cb => cb.value);
      
      // Show/hide action bar based on selection
      const actionBar = document.getElementById('removeActionBar');
      if (actionBar) {
        actionBar.style.display = count > 0 ? 'flex' : 'none';
      }
      
      const countSpan = document.getElementById('selectedCount');
      if (countSpan) {
        countSpan.textContent = \`已选择 \${count} 只股票\`;
      }
      
      const confirmBtn = document.getElementById('confirmRemoveBtn');
      if (confirmBtn) {
        confirmBtn.disabled = count === 0;
      }
      
      const selectAll = document.getElementById('selectAllCheckbox');
      if (selectAll) {
        selectAll.checked = count === allCheckboxes.length && count > 0;
        selectAll.indeterminate = count > 0 && count < allCheckboxes.length;
      }
    }
    
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const allCheckboxes = document.querySelectorAll('.stock-checkbox');
        allCheckboxes.forEach(cb => {
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
      cancelRemoveBtn.addEventListener('click', clearAllSelections);
    }
    
    // 监听股票行点击事件，点击行切换复选框
    document.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('click', (e) => {
        // Skip if currently in drag mode
        if (window.isDragSelectingStocks) {
          return;
        }
        
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
    
    // Drag-to-select functionality - 从表格外拖入自动勾选
    (function() {
      let isMouseDown = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startedOutsideTable = false;
      const hoverContainer = document.getElementById('hoverContainer');
      const stockTableElement = document.querySelector('table');
      
      if (!hoverContainer || !stockTableElement) return;
      
      console.log('[CodeTrader] Drag-to-select initialized');
      
      // Mouse down handler - only in hover container
      hoverContainer.addEventListener('mousedown', (e) => {
        console.log('[CodeTrader] Mouse down on:', e.target.tagName, e.target.className);
        
        // Ignore if clicking on checkbox, button, input, or interactive elements
        if (e.target.type === 'checkbox' ||
            e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' ||
            e.target.closest('.management-dropdown') ||
            e.target.closest('.context-menu') ||
            e.target.closest('.toggle-item')) {
          console.log('[CodeTrader] Ignoring click on interactive element');
          return;
        }
        
        // Check if clicking on text content cells (ONLY these allow text selection)
        const isTextCell = e.target.classList.contains('stock-name') ||
                          e.target.classList.contains('stock-code') ||
                          e.target.classList.contains('stock-price') ||
                          e.target.classList.contains('stock-change') ||
                          e.target.classList.contains('stock-percent');
        
        console.log('[CodeTrader] isTextCell:', isTextCell);
        
        // If clicking on text cells, allow text selection - don't track
        if (isTextCell) {
          console.log('[CodeTrader] Allowing text selection in text cell');
          return;
        }
        
        // All other areas (outside table, checkbox column, empty areas) enable drag select
        startedOutsideTable = true;
        
        // Start tracking mouse
        isMouseDown = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        window.isDragSelectingStocks = false;
        
        console.log('[CodeTrader] Started tracking mouse for drag select');
        
        // Prevent default to avoid text selection
        e.preventDefault();
      }, true); // Use capture phase
      
      // Helper function to check all rows in Y range
      function checkRowsInYRange(fromY, toY, mouseX) {
        const allRows = document.querySelectorAll('.stock-row');
        if (!allRows.length) return;
        
        let checkedAny = false;
        allRows.forEach(row => {
          const rect = row.getBoundingClientRect();
          // Check if this row is in the Y range
          if (rect.bottom >= Math.min(fromY, toY) && rect.top <= Math.max(fromY, toY)) {
            const checkbox = row.querySelector('.stock-checkbox');
            if (checkbox && !checkbox.checked) {
              checkbox.checked = true;
              checkedAny = true;
            }
          }
        });
        
        if (checkedAny) {
          updateRemoveUI();
        }
      }
      
      // Mouse move handler
      document.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        
        // Check if moved enough to be a drag (2px threshold)
        const deltaX = Math.abs(e.clientX - dragStartX);
        const deltaY = Math.abs(e.clientY - dragStartY);
        
        if (startedOutsideTable && (deltaX > 2 || deltaY > 2)) {
          if (!window.isDragSelectingStocks) {
            window.isDragSelectingStocks = true;
            hoverContainer.classList.add('drag-selecting');
            lastMouseY = dragStartY;
            console.log('[CodeTrader] Entered drag-selecting mode');
          }
          
          e.preventDefault();
          
          // Check all rows between last Y and current Y
          checkRowsInYRange(lastMouseY, e.clientY, e.clientX);
          lastMouseY = e.clientY;
        }
      });
      
      // Mouseover handler - catches rows even during fast movement
      document.addEventListener('mouseover', (e) => {
        if (!isMouseDown || !window.isDragSelectingStocks) return;
        
        // Check if hovering over a stock row
        const stockRow = e.target.closest('.stock-row');
        if (stockRow) {
          const checkbox = stockRow.querySelector('.stock-checkbox');
          if (checkbox && !checkbox.checked) {
            console.log('[CodeTrader] Auto-checking row (via mouseover):', checkbox.value);
            checkbox.checked = true;
            updateRemoveUI();
          }
        }
      }, true); // Use capture phase
      
      // Mouse up handler
      document.addEventListener('mouseup', () => {
        if (isMouseDown) {
          console.log('[CodeTrader] Mouse up, resetting drag state');
          isMouseDown = false;
          startedOutsideTable = false;
          if (window.isDragSelectingStocks) {
            window.isDragSelectingStocks = false;
            hoverContainer.classList.remove('drag-selecting');
          }
        }
      });
    })();
    
    // Stock row context menu
    const stockRowContextMenu = document.getElementById('stockRowContextMenu');
    const stockContextSetGroup = document.getElementById('stockContextSetGroup');
    const stockContextMoveToGroup = document.getElementById('stockContextMoveToGroup');
    const stockContextDelete = document.getElementById('stockContextDelete');
    const stockContextPin = document.getElementById('stockContextPin');
    const setGroupSubmenu = document.getElementById('setGroupSubmenu');
    const moveToSubmenu = document.getElementById('moveToSubmenu');
    let currentStockRowCodes = [];
    let stockRowMenuHideTimeout = null;
    let setGroupSubmenuHideTimeout = null;
    let moveToSubmenuHideTimeout = null;
    
    function showStockRowContextMenu(x, y, codes) {
      currentStockRowCodes = codes;
      stockRowContextMenu.style.left = x + 'px';
      stockRowContextMenu.style.top = y + 'px';
      stockRowContextMenu.classList.add('show');
      
      // Cancel any pending hide timeout
      if (stockRowMenuHideTimeout) {
        clearTimeout(stockRowMenuHideTimeout);
        stockRowMenuHideTimeout = null;
      }
    }
    
    function hideStockRowContextMenu() {
      stockRowContextMenu.classList.remove('show');
      if (setGroupSubmenu) {
        setGroupSubmenu.classList.remove('show');
      }
      if (moveToSubmenu) {
        moveToSubmenu.classList.remove('show');
      }
      currentStockRowCodes = [];
      if (stockRowMenuHideTimeout) {
        clearTimeout(stockRowMenuHideTimeout);
        stockRowMenuHideTimeout = null;
      }
      if (setGroupSubmenuHideTimeout) {
        clearTimeout(setGroupSubmenuHideTimeout);
        setGroupSubmenuHideTimeout = null;
      }
      if (moveToSubmenuHideTimeout) {
        clearTimeout(moveToSubmenuHideTimeout);
        moveToSubmenuHideTimeout = null;
      }
    }
    
    // Auto-hide stock row context menu on mouse leave with delay
    if (stockRowContextMenu) {
      stockRowContextMenu.addEventListener('mouseenter', () => {
        if (stockRowMenuHideTimeout) {
          clearTimeout(stockRowMenuHideTimeout);
          stockRowMenuHideTimeout = null;
        }
      });
      
      stockRowContextMenu.addEventListener('mouseleave', () => {
        stockRowMenuHideTimeout = setTimeout(() => {
          hideStockRowContextMenu();
        }, 500);
      });
    }
    
    // Handle stock row right-click
    document.querySelectorAll('.stock-row').forEach(row => {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const code = row.dataset.code;
        const checkbox = row.querySelector('.stock-checkbox');
        
        // Get selected codes (including current row if checked)
        let selectedCodes = Array.from(document.querySelectorAll('.stock-checkbox:checked')).map(cb => cb.value);
        
        // If current row is not selected, use only current row
        if (!selectedCodes.includes(code)) {
          selectedCodes = [code];
        }
        
        showStockRowContextMenu(e.clientX, e.clientY, selectedCodes);
        
        // Update pin menu label based on current state
        const pinLabel = document.getElementById('stockContextPinLabel');
        const pinIcon = document.getElementById('stockContextPinIcon');
        if (pinLabel && pinIcon) {
          const allPinned = selectedCodes.every(c => pinnedStocksSet.has(c));
          pinLabel.textContent = allPinned ? '取消置顶' : '置顶';
          pinIcon.textContent = allPinned ? '📌' : '📌';
        }
        
        // Populate set-group submenu
        if (setGroupSubmenu) {
          const currentGroupId = '${this.escapeHtml(this.currentGroupId)}';
          const groups = ${JSON.stringify(this.groups.map(g => ({ id: g.id, name: g.name })))};
          
          // Filter out current group
          const availableGroups = groups.filter(g => g.id !== currentGroupId);
          
          if (availableGroups.length === 0) {
            setGroupSubmenu.innerHTML = '<div class="context-menu-item" style="opacity: 0.5; cursor: default;">无其他分组</div>';
          } else {
            setGroupSubmenu.innerHTML = availableGroups.map(g => 
              \`<div class="context-menu-item set-group-item" data-group-id="\${g.id}">\${g.name}</div>\`
            ).join('');
            
            // Add click handlers for submenu items
            setGroupSubmenu.querySelectorAll('.set-group-item').forEach(item => {
              item.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetGroupId = item.dataset.groupId;
                vscode.postMessage({
                  command: 'setStocksGroup',
                  codes: currentStockRowCodes,
                  targetGroupId: targetGroupId
                });
                hideStockRowContextMenu();
              });
            });
          }
        }
        
        // Populate move-to submenu
        if (moveToSubmenu) {
          const currentGroupId = '${this.escapeHtml(this.currentGroupId)}';
          const groups = ${JSON.stringify(this.groups.map(g => ({ id: g.id, name: g.name })))};
          
          // Filter out current group
          const availableGroups = groups.filter(g => g.id !== currentGroupId);
          
          if (availableGroups.length === 0) {
            moveToSubmenu.innerHTML = '<div class="context-menu-item" style="opacity: 0.5; cursor: default;">无其他分组</div>';
          } else {
            moveToSubmenu.innerHTML = availableGroups.map(g => 
              \`<div class="context-menu-item move-to-item" data-group-id="\${g.id}">\${g.name}</div>\`
            ).join('');
            
            // Add click handlers for submenu items
            moveToSubmenu.querySelectorAll('.move-to-item').forEach(item => {
              item.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetGroupId = item.dataset.groupId;
                vscode.postMessage({
                  command: 'moveStocksToGroup',
                  codes: currentStockRowCodes,
                  targetGroupId: targetGroupId
                });
                hideStockRowContextMenu();
              });
            });
          }
        }
      });
    });
    
    // Handle pin from context menu
    if (stockContextPin) {
      stockContextPin.addEventListener('click', () => {
        if (currentStockRowCodes.length > 0) {
          vscode.postMessage({
            command: 'togglePin',
            codes: currentStockRowCodes
          });
        }
        hideStockRowContextMenu();
      });
    }

    // Handle delete from context menu
    if (stockContextDelete) {
      stockContextDelete.addEventListener('click', () => {
        if (currentStockRowCodes.length > 0) {
          vscode.postMessage({
            command: 'confirmRemove',
            codes: currentStockRowCodes
          });
        }
        hideStockRowContextMenu();
      });
    }

    // Show/hide set-group submenu on hover (with open delay)
    let setGroupSubmenuShowTimeout = null;
    if (stockContextSetGroup && setGroupSubmenu) {
      stockContextSetGroup.addEventListener('mouseenter', () => {
        if (setGroupSubmenuHideTimeout) {
          clearTimeout(setGroupSubmenuHideTimeout);
          setGroupSubmenuHideTimeout = null;
        }
        setGroupSubmenuShowTimeout = setTimeout(() => {
          setGroupSubmenu.classList.add('show');
        }, 200);
      });
      
      stockContextSetGroup.addEventListener('mouseleave', () => {
        if (setGroupSubmenuShowTimeout) {
          clearTimeout(setGroupSubmenuShowTimeout);
          setGroupSubmenuShowTimeout = null;
        }
        setGroupSubmenuHideTimeout = setTimeout(() => {
          setGroupSubmenu.classList.remove('show');
        }, 300);
      });
      
      setGroupSubmenu.addEventListener('mouseenter', () => {
        if (setGroupSubmenuHideTimeout) {
          clearTimeout(setGroupSubmenuHideTimeout);
          setGroupSubmenuHideTimeout = null;
        }
      });
      
      setGroupSubmenu.addEventListener('mouseleave', () => {
        setGroupSubmenuHideTimeout = setTimeout(() => {
          setGroupSubmenu.classList.remove('show');
        }, 300);
      });
    }
    
    // Show/hide move-to submenu on hover (with open delay)
    let moveToSubmenuShowTimeout = null;
    if (stockContextMoveToGroup && moveToSubmenu) {
      stockContextMoveToGroup.addEventListener('mouseenter', () => {
        if (moveToSubmenuHideTimeout) {
          clearTimeout(moveToSubmenuHideTimeout);
          moveToSubmenuHideTimeout = null;
        }
        moveToSubmenuShowTimeout = setTimeout(() => {
          moveToSubmenu.classList.add('show');
        }, 200);
      });
      
      stockContextMoveToGroup.addEventListener('mouseleave', () => {
        if (moveToSubmenuShowTimeout) {
          clearTimeout(moveToSubmenuShowTimeout);
          moveToSubmenuShowTimeout = null;
        }
        moveToSubmenuHideTimeout = setTimeout(() => {
          moveToSubmenu.classList.remove('show');
        }, 300);
      });
      
      moveToSubmenu.addEventListener('mouseenter', () => {
        if (moveToSubmenuHideTimeout) {
          clearTimeout(moveToSubmenuHideTimeout);
          moveToSubmenuHideTimeout = null;
        }
      });
      
      moveToSubmenu.addEventListener('mouseleave', () => {
        moveToSubmenuHideTimeout = setTimeout(() => {
          moveToSubmenu.classList.remove('show');
        }, 300);
      });
    }
    
    // Hide stock row context menu on click outside
    document.addEventListener('click', () => {
      hideStockRowContextMenu();
    });
    
    // Context menu for tabs
    const contextMenu = document.getElementById('tabContextMenu');
    const contextRename = document.getElementById('contextRename');
    const contextAddStock = document.getElementById('contextAddStock');
    const contextDelete = document.getElementById('contextDelete');
    let currentContextGroupId = null;
    let contextMenuHideTimeout = null;
    
    function showContextMenu(x, y, groupId) {
      currentContextGroupId = groupId;
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.classList.add('show');
      
      // Cancel any pending hide timeout
      if (contextMenuHideTimeout) {
        clearTimeout(contextMenuHideTimeout);
        contextMenuHideTimeout = null;
      }
    }
    
    function hideContextMenu() {
      contextMenu.classList.remove('show');
      currentContextGroupId = null;
      if (contextMenuHideTimeout) {
        clearTimeout(contextMenuHideTimeout);
        contextMenuHideTimeout = null;
      }
    }
    
    // Auto-hide context menu on mouse leave with delay
    contextMenu.addEventListener('mouseenter', () => {
      if (contextMenuHideTimeout) {
        clearTimeout(contextMenuHideTimeout);
        contextMenuHideTimeout = null;
      }
    });
    
    contextMenu.addEventListener('mouseleave', () => {
      contextMenuHideTimeout = setTimeout(() => {
        hideContextMenu();
      }, 500);
    });
    
    // Hide context menu on click outside
    document.addEventListener('click', () => {
      hideContextMenu();
    });
    
    // Handle group tabs
    let draggedTab = null;
    
    document.querySelectorAll('.tab').forEach(tab => {
      const groupId = tab.dataset.groupId;
      
      // Left click to switch
      tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close') && !e.target.classList.contains('tab-count')) {
          vscode.postMessage({
            command: 'switchGroup',
            groupId: groupId
          });
        }
      });
      
      // Right click for context menu (only for custom groups, not "all" or "create")
      if (groupId !== 'all' && groupId !== 'create') {
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, groupId);
        });
        
        // Drag and drop support
        tab.setAttribute('draggable', 'true');
        
        tab.addEventListener('dragstart', (e) => {
          draggedTab = tab;
          tab.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        
        tab.addEventListener('dragend', (e) => {
          tab.classList.remove('dragging');
          draggedTab = null;
        });
        
        tab.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          
          if (draggedTab && draggedTab !== tab) {
            const tabsContainer = tab.parentElement;
            const allTabs = Array.from(tabsContainer.querySelectorAll('.tab'));
            const draggedIndex = allTabs.indexOf(draggedTab);
            const targetIndex = allTabs.indexOf(tab);
            
            if (draggedIndex < targetIndex) {
              tab.parentElement.insertBefore(draggedTab, tab.nextSibling);
            } else {
              tab.parentElement.insertBefore(draggedTab, tab);
            }
          }
        });
        
        tab.addEventListener('drop', (e) => {
          e.preventDefault();
          
          // Get new order of group IDs
          const tabsContainer = tab.parentElement;
          const allTabs = Array.from(tabsContainer.querySelectorAll('.tab'));
          const groupIds = allTabs
            .map(t => t.dataset.groupId)
            .filter(id => id !== 'all' && id !== 'create');
          
          console.log('[Frontend] New group order:', groupIds);
          
          vscode.postMessage({
            command: 'reorderGroups',
            groupIds: groupIds
          });
        });
      }
    });
    
    // Custom confirm dialog
    const confirmOverlay = document.getElementById('confirmDialogOverlay');
    const confirmTitle = document.getElementById('confirmDialogTitle');
    const confirmMessage = document.getElementById('confirmDialogMessage');
    const confirmBtn = document.getElementById('confirmDialogConfirm');
    const cancelBtn = document.getElementById('confirmDialogCancel');
    
    let pendingConfirmAction = null;
    
    function showConfirm(title, message, onConfirm) {
      confirmTitle.textContent = title;
      confirmMessage.textContent = message;
      confirmOverlay.classList.add('show');
      pendingConfirmAction = onConfirm;
    }
    
    function hideConfirm() {
      confirmOverlay.classList.remove('show');
      pendingConfirmAction = null;
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        console.log('[Frontend] Confirm button clicked, pendingConfirmAction:', !!pendingConfirmAction);
        if (pendingConfirmAction) {
          pendingConfirmAction();
        }
        hideConfirm();
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', hideConfirm);
    }
    
    // Close on overlay click
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) {
        hideConfirm();
      }
    });
    
    // Rename dialog
    const renameOverlay = document.getElementById('renameDialogOverlay');
    const renameInput = document.getElementById('renameInput');
    const renameConfirmBtn = document.getElementById('renameDialogConfirm');
    const renameCancelBtn = document.getElementById('renameDialogCancel');
    
    function showRenameDialog(groupId, currentName) {
      renameInput.value = currentName;
      renameOverlay.classList.add('show');
      setTimeout(() => renameInput.focus(), 100);
      
      const handleRename = () => {
        const newName = renameInput.value.trim();
        if (newName && newName !== currentName) {
          vscode.postMessage({
            command: 'renameGroup',
            groupId: groupId,
            newName: newName
          });
        }
        hideRenameDialog();
      };
      
      renameConfirmBtn.onclick = handleRename;
      renameInput.onkeypress = (e) => {
        if (e.key === 'Enter') handleRename();
      };
    }
    
    function hideRenameDialog() {
      renameOverlay.classList.remove('show');
    }
    
    // Error dialog
    function showErrorDialog(message) {
      showConfirm('错误', message, null);
      // Hide cancel button for error dialog
      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
      // Change confirm button text to "确定"
      if (confirmBtn) {
        confirmBtn.textContent = '确定';
        confirmBtn.onclick = () => {
          hideConfirm();
          // Restore buttons for normal confirm dialog
          if (cancelBtn) cancelBtn.style.display = '';
          if (confirmBtn) confirmBtn.textContent = '确定';
        };
      }
    }
    
    if (renameCancelBtn) {
      renameCancelBtn.addEventListener('click', hideRenameDialog);
    }
    
    renameOverlay.addEventListener('click', (e) => {
      if (e.target === renameOverlay) {
        hideRenameDialog();
      }
    });
    
    // Context menu actions
    if (contextRename) {
      contextRename.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupIdToRename = currentContextGroupId;
        const tab = document.querySelector(\`.tab[data-group-id="\${groupIdToRename}"]\`);
        const groupName = tab ? tab.textContent.replace('×', '').trim().replace(/\s*\(\d+\)$/, '') : '';
        hideContextMenu();
        showRenameDialog(groupIdToRename, groupName);
      });
    }
    
    if (contextAddStock) {
      contextAddStock.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupIdToAdd = currentContextGroupId;
        hideContextMenu();
        vscode.postMessage({
          command: 'addToGroupById',
          groupId: groupIdToAdd
        });
      });
    }
    
    if (contextDelete) {
      contextDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[Frontend] Context delete clicked for groupId:', currentContextGroupId);
        
        // Save groupId before hiding context menu (which sets currentContextGroupId to null)
        const groupIdToDelete = currentContextGroupId;
        const tab = document.querySelector(\`.tab[data-group-id="\${groupIdToDelete}"]\`);
        const groupName = tab ? tab.textContent.replace('×', '').trim().replace(/\s*\(\d+\)$/, '') : '该分组';
        
        hideContextMenu();
        
        console.log('[Frontend] Showing confirm dialog for group:', groupName, 'groupId:', groupIdToDelete);
        showConfirm(
          '删除分组',
          \`确定要删除分组"\${groupName}"吗？\`,
          () => {
            console.log('[Frontend] Confirm callback executing, sending deleteGroup message for groupId:', groupIdToDelete);
            vscode.postMessage({
              command: 'deleteGroup',
              groupId: groupIdToDelete,
              skipConfirm: true
            });
          }
        );
      });
    }
    
    // Handle tab close buttons
    document.querySelectorAll('.tab-close').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = closeBtn.dataset.groupId;
        const tab = closeBtn.closest('.tab');
        const groupName = tab ? tab.textContent.replace('×', '').trim().replace(/\s*\(\d+\)$/, '') : '该分组';
        
        showConfirm(
          '删除分组',
          \`确定要删除分组"\${groupName}"吗？\`,
          () => {
            vscode.postMessage({
              command: 'deleteGroup',
              groupId: groupId,
              skipConfirm: true
            });
          }
        );
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
    
    function saveGroup() {
      if (!groupNameInput) return;
      
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
    }
    
    if (saveGroupBtn) {
      saveGroupBtn.addEventListener('click', saveGroup);
    }
    
    if (groupNameInput) {
      groupNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          saveGroup();
        }
      });
    }
    
    if (cancelCreateBtn) {
      cancelCreateBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'switchGroup', groupId: 'all' });
      });
    }
    
    // Handle add-to-group search filter
    const addToGroupSearch = document.getElementById('addToGroupSearch');
    if (addToGroupSearch) {
      addToGroupSearch.addEventListener('input', () => {
        const query = addToGroupSearch.value.trim().toLowerCase();
        const items = document.querySelectorAll('#stockSelection .stock-select-item');
        items.forEach(item => {
          const label = item.querySelector('label');
          const text = label ? label.textContent.toLowerCase() : '';
          item.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }

    // Handle add to group form
    const saveToGroupBtn = document.getElementById('saveToGroupBtn');
    const cancelAddToGroupBtn = document.getElementById('cancelAddToGroupBtn');
    
    if (saveToGroupBtn) {
      saveToGroupBtn.addEventListener('click', () => {
        const groupId = saveToGroupBtn.getAttribute('data-group-id');
        const checkboxes = document.querySelectorAll('.group-stock-checkbox:checked');
        const selectedStocks = Array.from(checkboxes).map(cb => cb.value);
        
        vscode.postMessage({
          command: 'saveToGroup',
          groupId: groupId,
          stocks: selectedStocks
        });
      });
    }
    
    if (cancelAddToGroupBtn) {
      cancelAddToGroupBtn.addEventListener('click', () => {
        const saveToGroupBtn = document.getElementById('saveToGroupBtn');
        if (saveToGroupBtn) {
          const groupId = saveToGroupBtn.getAttribute('data-group-id');
          vscode.postMessage({ command: 'switchGroup', groupId: groupId });
        } else {
          vscode.postMessage({ command: 'switchGroup', groupId: 'all' });
        }
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
