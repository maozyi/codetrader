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
    this.currentGroupId = 'all'; // Current active group tab ('all' or group id or 'create')
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
  /**
   * Trigger data loading for the currently active tab
   */
  _loadCurrentTabData() {
    if (this.currentGroupId === 'sector') {
      this.loadSectorData();
    } else if (this.currentGroupId === 'heatmap') {
      this.loadHeatmapData();
    } else if (this.currentGroupId === 'market') {
      this.loadMarketData();
    }
  }

  showHoverPanel() {
    // 如果已经有悬浮框，取消隐藏计时器并保持显示
    if (this.hoverPanel) {
      this.isHoveringStatusBar = true;
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
      // Refresh data for current tab
      this._loadCurrentTabData();
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
      if (message.command === "ready") {
        this._loadCurrentTabData();
        return;
      }
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
        // Heatmap tab → open fullscreen view instead of inline
        if (message.groupId === 'heatmap') {
          vscode.commands.executeCommand('codetrader.showHeatmap');
          return;
        }

        // Switch to different group tab
        this.currentGroupId = message.groupId;
        this.updateHoverPanelContent(this.currentStockInfos);

        // Load sector data if switching to sector tab
        if (message.groupId === 'sector') {
          this.loadSectorData();
        }
        // Load market overview data if switching to market tab
        if (message.groupId === 'market') {
          this.loadMarketData();
        }
      } else if (message.command === "loadSectorData") {
        this.loadSectorData();
      } else if (message.command === "createGroup") {
        // Create new group
        await this.handleCreateGroup(message.name, message.stocks);
      } else if (message.command === "deleteGroup") {
        // Delete group
        await this.handleDeleteGroup(message.groupId, message.skipConfirm);
      } else if (message.command === "renameGroup") {
        // Rename group
        await this.handleRenameGroup(message.groupId, message.newName);
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
      } else if (message.command === "searchStock") {
        const { searchStockList } = require("../services/stockSearch");
        const keyword = (message.keyword || "").toLowerCase();
        const isInGroup = this.currentGroupId && this.currentGroupId !== 'all'
          && this.currentGroupId !== 'create';

        let localMatches = [];
        if (isInGroup) {
          const currentGroup = this.groups.find(g => g.id === this.currentGroupId);
          const groupCodes = new Set(currentGroup ? currentGroup.stocks : []);
          const { getPinyinInitials } = require("../utils/pinyinInitial");
          const isAlpha = /^[a-z]+$/.test(keyword);
          localMatches = this.currentStockInfos
            .filter(s => !groupCodes.has(s.code))
            .filter(s => {
              if (isAlpha) return getPinyinInitials(s.name).startsWith(keyword);
              return s.code.toLowerCase().includes(keyword) ||
                s.name.toLowerCase().includes(keyword);
            })
            .map(s => ({ code: s.code, name: s.name, market: s.code.substring(0, 2).toUpperCase() }));
        }

        const apiResults = await searchStockList(message.keyword);
        const existingCodes = new Set(this.currentStockInfos.map(s => s.code));
        const newResults = apiResults.filter(r => !existingCodes.has(r.code.toLowerCase()));

        if (this.hoverPanel) {
          this.hoverPanel.webview.postMessage({
            command: "searchResults",
            localMatches: localMatches,
            apiResults: isInGroup ? newResults : apiResults.filter(r => !existingCodes.has(r.code)),
            isInGroup: isInGroup,
          });
        }
      } else if (message.command === "quickAddStock") {
        await this.handleQuickAddStock(message.code);
      } else if (message.command === "addToCurrentGroup") {
        await this.handleAddToCurrentGroup(message.code);
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
  /**
   * Handle save stocks to existing group
   */
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
   * Quick add stock from search box
   */
  async handleQuickAddStock(code) {
    const vscode = require("vscode");
    const { getStocks, saveStocks, getStockGroups, saveStockGroups } = require("../config");
    const { getStockList } = require("../services/stockService");

    const normalizedCode = code.toLowerCase();
    const stocks = getStocks();
    const alreadyInGlobal = stocks.includes(normalizedCode);
    const isInGroup = this.currentGroupId && this.currentGroupId !== 'all'
      && this.currentGroupId !== 'create';

    let alreadyInGroup = false;
    if (isInGroup) {
      const groups = getStockGroups();
      const group = groups.find(g => g.id === this.currentGroupId);
      alreadyInGroup = group ? group.stocks.includes(normalizedCode) : false;
    }

    if (alreadyInGlobal && (!isInGroup || alreadyInGroup)) {
      vscode.window.showWarningMessage(
        alreadyInGroup ? "该股票已在当前分组中" : "该股票已存在"
      );
      return;
    }

    const stockInfo = await getStockList([normalizedCode]);
    if (!stockInfo || !stockInfo[0]?.name) {
      vscode.window.showErrorMessage("股票获取失败，请检查代码");
      return;
    }

    if (!alreadyInGlobal) {
      stocks.push(normalizedCode);
      await saveStocks(stocks);
    }

    if (isInGroup) {
      const groups = getStockGroups();
      const group = groups.find(g => g.id === this.currentGroupId);
      if (group && !group.stocks.includes(normalizedCode)) {
        group.stocks.push(normalizedCode);
        await saveStockGroups(groups);
      }
    }

    vscode.window.showInformationMessage(`✅ 已添加: ${stockInfo[0].name}(${stockInfo[0].code})`);
    if (this.updateCallback) {
      await this.updateCallback();
    }
  }

  /**
   * Add an existing global stock to the current group only
   */
  async handleAddToCurrentGroup(code) {
    const vscode = require("vscode");
    const { getStockGroups, saveStockGroups } = require("../config");

    const normalizedCode = code.toLowerCase();
    const groups = getStockGroups();
    const group = groups.find(g => g.id === this.currentGroupId);
    if (!group) return;

    if (group.stocks.includes(normalizedCode)) {
      vscode.window.showWarningMessage("该股票已在当前分组中");
      return;
    }

    group.stocks.push(normalizedCode);
    await saveStockGroups(groups);

    const info = this.currentStockInfos.find(s => s.code === normalizedCode);
    const label = info ? `${info.name}(${info.code})` : normalizedCode;
    vscode.window.showInformationMessage(`✅ 已添加到分组: ${label}`);
    if (this.updateCallback) {
      await this.updateCallback();
    }
  }

  /**
   * Load sector data and send to WebView
   */
  async loadSectorData() {
    if (!this.hoverPanel) return;
    
    try {
      const { getSectorList } = require("../services/sectorService");
      const sectors = await getSectorList();
      
      // Sort by amount (market weight) desc
      sectors.sort((a, b) => b.amount - a.amount);
      
      this.hoverPanel.webview.postMessage({
        command: "sectorData",
        sectors: sectors,
      });
    } catch (error) {
      console.error("[StatusBar] Failed to load sector data:", error);
      this.hoverPanel.webview.postMessage({
        command: "sectorError",
        error: "加载板块数据失败",
      });
    }
  }

  /**
   * Load heatmap data (full A-share market) and send to WebView
   * Stale-while-revalidate: show cached instantly, refresh in background
   */
  async loadHeatmapData() {
    if (!this.hoverPanel) return;

    try {
      const { fetchHeatmapData, getCachedHeatmapData } = require("../services/heatmapService");

      // Show cached data immediately
      const cached = getCachedHeatmapData();
      if (cached) {
        this.hoverPanel.webview.postMessage({
          command: "heatmapData",
          data: cached,
        });
      }

      // Fetch fresh data
      const data = await fetchHeatmapData();
      if (data !== cached) {
        this.hoverPanel.webview.postMessage({
          command: "heatmapData",
          data: data,
        });
      }
    } catch (error) {
      console.error("[StatusBar] Failed to load heatmap data:", error);
      this.hoverPanel.webview.postMessage({
        command: "heatmapError",
        error: "加载大盘云图失败",
      });
    }
  }

  /**
   * Load market overview data (indices + stats)
   * Stale-while-revalidate: show cached data instantly, refresh in background
   */
  async loadMarketData() {
    if (!this.hoverPanel) return;

    try {
      const { getCachedIndices, getCachedStats, refreshAll } = require("../services/marketService");

      // 1. Send cached data immediately for instant display
      const cachedIndices = getCachedIndices();
      const cachedStats = getCachedStats();

      if (cachedIndices) {
        const totalAmount = cachedIndices.indices.length >= 2
          ? (cachedIndices.indices[0].amount || 0) + (cachedIndices.indices[1].amount || 0)
          : 0;
        this.hoverPanel.webview.postMessage({
          command: "marketIndices",
          indices: cachedIndices.indices,
          totalAmount: totalAmount,
          upCount: cachedStats ? cachedStats.upCount : null,
          downCount: cachedStats ? cachedStats.downCount : null,
          flatCount: cachedStats ? cachedStats.flatCount : null,
        });
        if (cachedStats) {
          this.hoverPanel.webview.postMessage({
            command: "marketStats",
            stats: cachedStats,
            upCount: cachedStats.upCount,
            downCount: cachedStats.downCount,
            flatCount: cachedStats.flatCount,
          });
        }
      }

      // 2. Fetch fresh data in background (deduped: shares in-flight request if any)
      const [freshIndices, freshStats] = await refreshAll();

      // 3. Only send update if data actually changed (first load or stale cache)
      if (freshIndices !== cachedIndices || !cachedIndices) {
        const totalAmount = freshIndices.indices.length >= 2
          ? (freshIndices.indices[0].amount || 0) + (freshIndices.indices[1].amount || 0)
          : 0;
        this.hoverPanel.webview.postMessage({
          command: "marketIndices",
          indices: freshIndices.indices,
          totalAmount: totalAmount,
          upCount: freshStats.upCount,
          downCount: freshStats.downCount,
          flatCount: freshStats.flatCount,
        });
      }
      if (freshStats !== cachedStats || !cachedStats) {
        this.hoverPanel.webview.postMessage({
          command: "marketStats",
          stats: freshStats,
          upCount: freshStats.upCount,
          downCount: freshStats.downCount,
          flatCount: freshStats.flatCount,
        });
      }
    } catch (error) {
      console.error("[StatusBar] Failed to load market data:", error);
      this.hoverPanel.webview.postMessage({
        command: "marketError",
        error: "加载大盘数据失败: " + error.message,
      });
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
    if (this.currentGroupId !== 'all' && this.currentGroupId !== 'create') {
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
    /* Market overview styles */
    .market-overview {
      width: 100%; height: 100%;
      overflow-y: auto; overflow-x: hidden;
    }
    .market-loading {
      text-align: center; padding: 40px;
      color: var(--vscode-descriptionForeground); font-size: 14px;
    }
    .market-content {
      padding: 12px 16px;
    }
    .index-cards {
      display: flex; gap: 8px; margin-bottom: 16px;
    }
    .index-card {
      flex: 1;
      border-radius: 6px;
      padding: 10px 12px;
      text-align: center;
    }
    .index-card.up { background: rgba(243,70,93,0.12); }
    .index-card.down { background: rgba(26,197,103,0.12); }
    .index-card.flat { background: rgba(128,128,128,0.12); }
    .index-card .idx-name {
      font-size: 12px; color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }
    .index-card .idx-price {
      font-size: 18px; font-weight: 700;
      margin-bottom: 2px;
    }
    .index-card .idx-change {
      font-size: 11px;
    }
    .index-card.up .idx-price,
    .index-card.up .idx-change { color: #f5465d; }
    .index-card.down .idx-price,
    .index-card.down .idx-change { color: #1ac567; }
    .index-card.flat .idx-price,
    .index-card.flat .idx-change { color: #888; }
    .market-analysis {
      margin-top: 4px;
    }
    .analysis-header {
      font-size: 13px; font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .analysis-header .amount-val {
      color: var(--vscode-foreground); font-weight: 700;
    }
    .analysis-header .volume-diff {
      font-size: 12px; margin-left: 12px;
    }
    .analysis-header .volume-diff.positive { color: #f5465d; }
    .analysis-header .volume-diff.negative { color: #1ac567; }
    .chart-area {
      position: relative;
      width: 100%; height: 200px;
      margin-bottom: 8px;
    }
    .chart-area canvas {
      width: 100%; height: 100%;
    }
    .breadth-bar-wrap {
      margin-top: 4px;
    }
    .breadth-bar {
      display: flex; height: 6px; border-radius: 3px; overflow: hidden;
      margin-bottom: 4px;
    }
    .breadth-bar .up-part { background: #f5465d; }
    .breadth-bar .flat-part { background: #888; }
    .breadth-bar .down-part { background: #1ac567; }
    .breadth-labels {
      display: flex; justify-content: space-between;
      font-size: 12px;
    }
    .breadth-labels .up-label { color: #f5465d; }
    .breadth-labels .down-label { color: #1ac567; }
    /* Sector styles */
    .sector-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sector-loading {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .sector-heatmap {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .sector-legend {
      padding: 8px 16px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .legend-label {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .legend-divider {
      color: var(--vscode-panel-border);
    }
    #sectorCanvas {
      display: block;
      cursor: pointer;
      width: 100%;
      flex: 1;
      min-height: 0;
    }
    #heatmapContainer {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 170px);
    }
    #heatmapArea {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    #heatmapCanvas {
      display: block;
      cursor: pointer;
      width: 100%;
      flex: 1;
      min-height: 0;
    }
    .sector-tooltip {
      position: fixed;
      background: var(--vscode-editorHoverWidget-background);
      border: 1px solid var(--vscode-editorHoverWidget-border);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 11px;
      pointer-events: none;
      display: none;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      max-width: 200px;
    }
    .sector-tooltip.visible {
      display: block;
    }
    .sector-tooltip-name {
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }
    .sector-tooltip-change {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .sector-tooltip-change.up {
      color: #f5465d;
    }
    .sector-tooltip-change.down {
      color: #1ac567;
    }
    .sector-tooltip-info {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
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
    .pin-toggle {
      font-size: 10px;
      margin-right: 3px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
      display: inline-block;
      vertical-align: middle;
    }
    .pin-toggle.is-pinned {
      opacity: 1;
    }
    .pin-toggle.is-pinned:hover {
      opacity: 0.5;
    }
    .stock-row:hover .pin-toggle {
      opacity: 0.4;
    }
    .stock-row:hover .pin-toggle:hover {
      opacity: 1;
    }
    .stock-row:hover .pin-toggle.is-pinned {
      opacity: 1;
    }
    .stock-row:hover .pin-toggle.is-pinned:hover {
      opacity: 0.4;
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
    /* Search add box */
    .search-add-box {
      position: relative;
      padding: 6px 12px;
    }
    .search-add-wrapper {
      display: flex;
      align-items: center;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 0 8px;
    }
    .search-add-wrapper:focus-within {
      border-color: var(--vscode-focusBorder);
    }
    .search-add-icon {
      font-size: 12px;
      opacity: 0.6;
      margin-right: 4px;
      flex-shrink: 0;
    }
    #quickSearchInput {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--vscode-input-foreground);
      font-size: 12px;
      padding: 5px 0;
      font-family: inherit;
    }
    #quickSearchInput::placeholder {
      color: var(--vscode-input-placeholderForeground);
      font-size: 11px;
    }
    .search-results-dropdown {
      display: none;
      position: absolute;
      left: 12px;
      right: 12px;
      top: 100%;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .search-results-dropdown.visible {
      display: block;
    }
    .search-result-item {
      padding: 6px 10px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .search-result-item:last-child {
      border-bottom: none;
    }
    .search-result-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .search-result-name {
      flex: 1;
    }
    .search-result-code {
      opacity: 0.6;
      margin-left: 8px;
      font-size: 11px;
    }
    .search-result-add {
      margin-left: 8px;
      color: var(--vscode-textLink-foreground);
      font-size: 11px;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .search-result-item:hover .search-result-add {
      opacity: 1;
    }
    .search-no-result {
      padding: 8px 10px;
      font-size: 12px;
      opacity: 0.6;
      text-align: center;
    }
    .search-section-header {
      padding: 5px 10px;
      font-size: 11px;
      opacity: 0.5;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background, transparent);
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
    <div class="search-add-box" style="${['sector','market','heatmap'].includes(this.currentGroupId) ? 'display:none;' : ''}">
      <div class="search-add-wrapper">
        <span class="search-add-icon">🔍</span>
        <input type="text" id="quickSearchInput" placeholder="搜索并添加股票（代码/名称/拼音首字母，如 gzmt）" autocomplete="off" />
      </div>
      <div class="search-results-dropdown" id="searchResultsDropdown"></div>
    </div>
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
    if (this.currentGroupId === 'market') {
      return this.getMarketOverviewHtml();
    } else if (this.currentGroupId === 'heatmap') {
      return this.getHeatmapHtml();
    } else if (this.currentGroupId === 'sector') {
      return this.getSectorListHtml();
    } else if (this.currentGroupId === 'create') {
      return this.getCreateGroupFormHtml();
    } else {
      return this.getStockTableHtml(stocks);
    }
  }

  /**
   * Generate market overview HTML
   */
  getMarketOverviewHtml() {
    return `
    <div class="market-overview" id="marketOverview">
      <div class="market-loading" id="marketLoading">正在加载大盘数据...</div>
      <div class="market-content" id="marketContent" style="display:none;">
        <div class="index-cards" id="indexCards"></div>
        <div class="market-analysis">
          <div class="analysis-header" id="analysisHeader"></div>
          <div class="chart-area">
            <canvas id="marketChart"></canvas>
          </div>
          <div class="breadth-bar-wrap" id="breadthBarWrap"></div>
        </div>
      </div>
    </div>`;
  }

  /**
   * Generate heatmap HTML (full A-share market treemap)
   */
  getHeatmapHtml() {
    return `
    <div class="sector-container" id="heatmapContainer">
      <div class="sector-loading" id="heatmapLoading">正在加载大盘云图...</div>
      <div class="sector-heatmap" id="heatmapArea" style="display:none;">
        <div class="sector-legend">
          <span class="legend-item">
            <span class="legend-label">粒度</span> = 个股（全 A 5000+）
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">色块</span> = 每只股票
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">面积</span> = 总市值
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">颜色</span> = 涨跌幅（<span style="color:#1ac567">█ 跌</span> <span style="color:#f5465d">█ 涨</span>）
          </span>
        </div>
        <canvas id="heatmapCanvas"></canvas>
        <div class="sector-tooltip" id="heatmapTooltip"></div>
      </div>
    </div>`;
  }

  /**
   * Generate sector list HTML
   */
  getSectorListHtml() {
    // 板块热力图Canvas，实际数据在 JS 中异步加载
    return `
    <div class="sector-container">
      <div class="sector-loading" id="sectorLoading">正在加载板块数据...</div>
      <div class="sector-heatmap" id="sectorHeatmap" style="display:none;">
        <div class="sector-legend">
          <span class="legend-item">
            <span class="legend-label">粒度</span> = 行业板块
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">色块</span> = 每个板块
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">面积</span> = 成交额
          </span>
          <span class="legend-divider">|</span>
          <span class="legend-item">
            <span class="legend-label">颜色</span> = 涨跌幅（<span style="color:#1ac567">█ 跌</span> <span style="color:#f5465d">█ 涨</span>）
          </span>
        </div>
        <canvas id="sectorCanvas"></canvas>
        <div class="sector-tooltip" id="sectorTooltip"></div>
      </div>
    </div>`;
  }

  /**
   * Generate group tabs HTML
   */
  getGroupTabsHtml() {
    const allStocksCount = require("../config").getStocks().length;
    
    let tabsHtml = `
    <div class="group-tabs">
      <div class="tab ${this.currentGroupId === 'market' ? 'active' : ''}" data-group-id="market">
        📈 大盘
      </div>
      <div class="tab ${this.currentGroupId === 'heatmap' ? 'active' : ''}" data-group-id="heatmap">
        🔥 云图
      </div>
      <div class="tab ${this.currentGroupId === 'sector' ? 'active' : ''}" data-group-id="sector">
        📊 板块
      </div>
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
        <td class="stock-name"><span class="pin-toggle ${isPinned ? 'is-pinned' : ''}" data-code="${this.escapeHtml(stock.code)}" title="${isPinned ? '取消置顶' : '置顶'}">📌</span>${this.escapeHtml(stock.name)}</td>
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
  /**
   * Generate create group form HTML
   */
  getCreateGroupFormHtml() {
    return `
    <div class="create-group-form">
      <h3>新建分组</h3>
      <div class="form-group">
        <label for="groupName">分组名称:</label>
        <input type="text" id="groupName" placeholder="例如: 光伏概念" autofocus />
      </div>
      <p style="font-size: 11px; opacity: 0.6; margin: 8px 0;">创建后可通过搜索框添加股票到分组</p>
      <div class="form-actions">
        <button class="action-button cancel" id="cancelCreateBtn">取消</button>
        <button class="action-button confirm" id="saveGroupBtn">创建</button>
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
        clearAllSelections();
      } else if (message.command === 'searchResults') {
        renderSearchResults(message.localMatches, message.apiResults, message.isInGroup);
      } else if (message.command === 'sectorData') {
        renderSectorData(message.sectors);
      } else if (message.command === 'sectorError') {
        showSectorError(message.error);
      } else if (message.command === 'heatmapData') {
        renderHeatmap(message.data);
      } else if (message.command === 'heatmapError') {
        showHeatmapError(message.error);
      } else if (message.command === 'marketIndices') {
        renderMarketIndices(message.indices, message.totalAmount, message.upCount, message.downCount, message.flatCount);
      } else if (message.command === 'marketStats') {
        renderMarketStats(message.stats, message.upCount, message.downCount, message.flatCount);
      } else if (message.command === 'marketError') {
        showMarketError(message.error);
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

    // Signal that the webview DOM is ready
    vscode.postMessage({ command: 'ready' });

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
    
    // Handle inline pin toggle (click on 📌 icon in row)
    document.querySelectorAll('.pin-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = el.dataset.code;
        if (code) {
          vscode.postMessage({
            command: 'togglePin',
            codes: [code]
          });
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
    
    // Render sector data as treemap heatmap
    function renderSectorData(sectors) {
      const loading = document.getElementById('sectorLoading');
      const heatmap = document.getElementById('sectorHeatmap');
      const canvas = document.getElementById('sectorCanvas');
      const tooltip = document.getElementById('sectorTooltip');
      
      if (!loading || !heatmap || !canvas || !tooltip) return;
      
      loading.style.display = 'none';
      heatmap.style.display = 'flex';
      
      // Set canvas size to match container (with device pixel ratio for sharp rendering)
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      const width = rect.width;
      const height = rect.height;
      
      // Clear canvas with dark background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);
      
      // Use pivot-based binary treemap for better rectangular layout
      const layout = binaryTreemap(sectors, {x: 0, y: 0, width, height});
      
      // Draw rectangles
      layout.forEach(item => {
        const {x, y, width: w, height: h, data} = item;
        
        // Get color based on change percent
        const color = getChangeColor(data.changePct);
        
        // Draw rectangle with subtle gradient
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, adjustBrightness(color, -15));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);
        
        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        
        // Draw text (ultra-low threshold, show text on almost all blocks)
        if (w > 20 && h > 12) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          
          ctx.fillStyle = '#FFFFFF';
          
          // Very small font for tiny blocks
          const nameFontSize = Math.min(16, Math.max(7, Math.floor(w / 6)));
          ctx.font = \`500 \${nameFontSize}px "Microsoft YaHei", Arial, sans-serif\`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Aggressive truncation for small blocks
          const maxChars = Math.max(1, Math.floor(w / 9));
          const nameText = data.name.length > maxChars ? data.name.substring(0, maxChars) + (maxChars > 1 ? '…' : '') : data.name;
          
          // Single line for very small blocks
          if (h < 25) {
            ctx.fillText(nameText, centerX, centerY);
          } else {
            ctx.fillText(nameText, centerX, centerY - nameFontSize/2 - 2);
            
            // Draw change percent if enough height
            if (h > 26) {
              const changeFontSize = Math.min(18, Math.max(8, Math.floor(w / 5)));
              ctx.font = \`600 \${changeFontSize}px Arial, sans-serif\`;
              const sign = data.changePct >= 0 ? '+' : '';
              const changeText = \`\${sign}\${data.changePct.toFixed(1)}%\`;
              ctx.fillText(changeText, centerX, centerY + changeFontSize/2 + 2);
            }
          }
          
          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
        
        // Store data for hover interaction
        item.bounds = {x, y, width: w, height: h};
      });
      
      // Mouse interaction (scale coordinates back)
      let currentHover = null;
      
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left);
        const mouseY = (e.clientY - rect.top);
        
        const hovered = layout.find(item => {
          const {x, y, width: w, height: h} = item.bounds;
          return mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h;
        });
        
        if (hovered && hovered !== currentHover) {
          currentHover = hovered;
          showTooltip(tooltip, hovered.data, e.clientX, e.clientY);
        } else if (!hovered && currentHover) {
          currentHover = null;
          hideTooltip(tooltip);
        } else if (hovered) {
          // Update tooltip position (6px offset, smart positioning)
          const tooltipRect = tooltip.getBoundingClientRect();
          const tooltipWidth = tooltipRect.width;
          const tooltipHeight = tooltipRect.height;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          const offset = 6;
          const inBottomHalf = e.clientY > viewportHeight / 2;
          
          let left = e.clientX + offset;
          let top = inBottomHalf ? e.clientY - tooltipHeight - offset : e.clientY + offset;
          
          if (left + tooltipWidth > viewportWidth - 5) {
            left = e.clientX - tooltipWidth - offset;
          }
          
          if (left < 5) left = 5;
          if (top < 5) top = 5;
          
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
        }
      });
      
      canvas.addEventListener('mouseleave', () => {
        currentHover = null;
        hideTooltip(tooltip);
      });
      
      canvas.addEventListener('click', (e) => {
        if (currentHover) {
          console.log('Clicked sector:', currentHover.data.code);
        }
      });
    }
    
    // Binary treemap layout algorithm (more rectangular, balanced)
    function binaryTreemap(data, container) {
      const totalValue = data.reduce((sum, d) => sum + d.amount, 0);
      const items = data.map(d => ({
        data: d,
        value: d.amount
      }));
      
      const result = [];
      binaryTreemapRecursive(items, container, totalValue, result);
      return result;
    }
    
    function binaryTreemapRecursive(items, container, totalValue, result) {
      if (items.length === 0) return;
      
      if (items.length === 1) {
        result.push({
          x: container.x,
          y: container.y,
          width: container.width,
          height: container.height,
          data: items[0].data
        });
        return;
      }
      
      // Find pivot that splits items into roughly equal total values
      const targetValue = totalValue / 2;
      let leftSum = 0;
      let pivot = 0;
      let minDiff = Infinity;
      
      for (let i = 0; i < items.length; i++) {
        leftSum += items[i].value;
        const diff = Math.abs(leftSum - targetValue);
        if (diff < minDiff) {
          minDiff = diff;
          pivot = i;
        }
      }
      
      const leftItems = items.slice(0, pivot + 1);
      const rightItems = items.slice(pivot + 1);
      const leftValue = leftItems.reduce((sum, item) => sum + item.value, 0);
      const rightValue = rightItems.reduce((sum, item) => sum + item.value, 0);
      
      // Decide split direction based on aspect ratio
      const isHorizontal = container.width >= container.height;
      
      if (isHorizontal) {
        // Split horizontally
        const leftWidth = container.width * (leftValue / totalValue);
        binaryTreemapRecursive(leftItems, {
          x: container.x,
          y: container.y,
          width: leftWidth,
          height: container.height
        }, leftValue, result);
        binaryTreemapRecursive(rightItems, {
          x: container.x + leftWidth,
          y: container.y,
          width: container.width - leftWidth,
          height: container.height
        }, rightValue, result);
      } else {
        // Split vertically
        const leftHeight = container.height * (leftValue / totalValue);
        binaryTreemapRecursive(leftItems, {
          x: container.x,
          y: container.y,
          width: container.width,
          height: leftHeight
        }, leftValue, result);
        binaryTreemapRecursive(rightItems, {
          x: container.x,
          y: container.y + leftHeight,
          width: container.width,
          height: container.height - leftHeight
        }, rightValue, result);
      }
    }
    
    // Squarified treemap layout algorithm
    function squarify(data, container) {
      const totalValue = data.reduce((sum, d) => sum + d.marketCap, 0);
      const items = data.map(d => ({
        data: d,
        normalizedValue: d.marketCap / totalValue * container.width * container.height
      })).sort((a, b) => b.normalizedValue - a.normalizedValue);
      
      const result = [];
      squarifyRecursive(items, [], container, result);
      return result;
    }
    
    function squarifyRecursive(items, currentRow, container, result) {
      if (items.length === 0) {
        if (currentRow.length > 0) {
          layoutRow(currentRow, container, result);
        }
        return;
      }
      
      const item = items[0];
      const newRow = [...currentRow, item];
      
      if (currentRow.length === 0 || worstAspectRatio(newRow, container) <= worstAspectRatio(currentRow, container)) {
        squarifyRecursive(items.slice(1), newRow, container, result);
      } else {
        const {width, height} = layoutRow(currentRow, container, result);
        const newContainer = {
          x: container.x + (width < container.width ? width : 0),
          y: container.y + (width >= container.width ? height : 0),
          width: width < container.width ? container.width - width : container.width,
          height: width >= container.width ? container.height - height : container.height
        };
        squarifyRecursive(items, [], newContainer, result);
      }
    }
    
    function worstAspectRatio(row, container) {
      const sum = row.reduce((s, item) => s + item.normalizedValue, 0);
      const width = Math.min(container.width, container.height);
      const height = sum / width;
      
      let worst = 0;
      row.forEach(item => {
        const itemHeight = item.normalizedValue / width;
        const ratio = Math.max(width / itemHeight, itemHeight / width);
        worst = Math.max(worst, ratio);
      });
      return worst;
    }
    
    function layoutRow(row, container, result) {
      const sum = row.reduce((s, item) => s + item.normalizedValue, 0);
      const isVertical = container.width >= container.height;
      const thickness = isVertical ? sum / container.height : sum / container.width;
      
      let offset = 0;
      row.forEach(item => {
        const length = item.normalizedValue / thickness;
        const rect = isVertical ? {
          x: container.x,
          y: container.y + offset,
          width: thickness,
          height: length,
          data: item.data
        } : {
          x: container.x + offset,
          y: container.y,
          width: length,
          height: thickness,
          data: item.data
        };
        result.push(rect);
        offset += length;
      });
      
      return {width: isVertical ? thickness : container.width, height: isVertical ? container.height : thickness};
    }
    
    // Get color based on change percent (pure red/green with depth)
    function getChangeColor(changePct) {
      const clamped = Math.max(-10, Math.min(10, changePct));
      
      if (changePct >= 0) {
        // Red shades for positive (light to deep red)
        const intensity = Math.min(1, changePct / 5); // 0-5% maps to 0-1
        const r = Math.round(180 + 75 * intensity); // 180-255
        const g = Math.round(60 - 40 * intensity);   // 60-20
        const b = Math.round(60 - 40 * intensity);   // 60-20
        return \`rgb(\${r}, \${g}, \${b})\`;
      } else {
        // Green shades for negative (light to deep green)
        const intensity = Math.min(1, Math.abs(changePct) / 5);
        const r = Math.round(60 - 40 * intensity);    // 60-20
        const g = Math.round(180 + 75 * intensity);   // 180-255
        const b = Math.round(60 - 40 * intensity);    // 60-20
        return \`rgb(\${r}, \${g}, \${b})\`;
      }
    }
    
    // Adjust color brightness
    function adjustBrightness(color, amount) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return color;
      
      const r = Math.max(0, Math.min(255, parseInt(match[1]) + amount));
      const g = Math.max(0, Math.min(255, parseInt(match[2]) + amount));
      const b = Math.max(0, Math.min(255, parseInt(match[3]) + amount));
      return \`rgb(\${r}, \${g}, \${b})\`;
    }
    
    // Check if color is light (for text color selection)
    function isLightColor(color) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return false;
      
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 155;
    }
    
    // Wrap text to fit width
    function wrapText(ctx, text, maxWidth) {
      const words = text.split('');
      const lines = [];
      let currentLine = '';
      
      for (const char of words) {
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines.slice(0, 2); // Max 2 lines
    }
    
    // Show tooltip with smart positioning
    function showTooltip(tooltip, data, x, y) {
      const isUp = data.changePct >= 0;
      const sign = isUp ? '+' : '';
      tooltip.innerHTML = \`
        <div class="sector-tooltip-name">\${data.name}</div>
        <div class="sector-tooltip-change \${isUp ? 'up' : 'down'}">\${sign}\${data.changePct.toFixed(2)}%</div>
        <div class="sector-tooltip-info">\${data.stockCount}只股票 | 成交\${(data.amount / 100000000).toFixed(2)}亿</div>
      \`;
      
      // Show first to measure size
      tooltip.classList.add('visible');
      
      // Get tooltip dimensions
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Very small offset: 6px
      const offset = 6;
      
      // Check vertical position
      const inBottomHalf = y > viewportHeight / 2;
      
      // Default: right side of cursor
      let left = x + offset;
      let top = inBottomHalf ? y - tooltipHeight - offset : y + offset;
      
      // If would go off right edge, show on left
      if (left + tooltipWidth > viewportWidth - 5) {
        left = x - tooltipWidth - offset;
      }
      
      // Bounds check
      if (left < 5) left = 5;
      if (top < 5) top = 5;
      
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }
    
    // Hide tooltip
    function hideTooltip(tooltip) {
      tooltip.classList.remove('visible');
    }
    
    // Show sector error
    function showSectorError(message) {
      const loading = document.getElementById('sectorLoading');
      if (loading) {
        loading.textContent = message || '加载失败';
        loading.style.color = 'var(--vscode-errorForeground)';
      }
    }

    // ===== Heatmap Rendering =====
    function showHeatmapError(msg) {
      const el = document.getElementById('heatmapLoading');
      if (el) { el.textContent = msg || '加载失败'; el.style.color = 'var(--vscode-errorForeground)'; }
    }

    function showMarketError(msg) {
      const el = document.getElementById('marketLoading');
      if (el) { el.textContent = msg || '加载失败'; el.style.color = 'var(--vscode-errorForeground)'; }
    }

    function renderMarketIndices(indices, totalAmount, upCount, downCount, flatCount) {
      const loadingEl = document.getElementById('marketLoading');
      const contentEl = document.getElementById('marketContent');
      if (!loadingEl || !contentEl) return;
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';

      // Index cards
      const cardsEl = document.getElementById('indexCards');
      if (cardsEl && indices && indices.length) {
        cardsEl.innerHTML = indices.map(idx => {
          const cls = idx.changePct > 0 ? 'up' : idx.changePct < 0 ? 'down' : 'flat';
          const sign = idx.change >= 0 ? '+' : '';
          return '<div class="index-card ' + cls + '">' +
            '<div class="idx-name">' + idx.name + '</div>' +
            '<div class="idx-price">' + (idx.price != null ? idx.price.toFixed(2) : '--') + '</div>' +
            '<div class="idx-change">' + sign + (idx.change != null ? idx.change.toFixed(2) : '--') +
            ' ' + sign + (idx.changePct != null ? idx.changePct.toFixed(2) : '--') + '%</div>' +
            '</div>';
        }).join('');
      }

      // Analysis header
      const headerEl = document.getElementById('analysisHeader');
      if (headerEl && totalAmount) {
        const amtStr = totalAmount >= 1e12
          ? (totalAmount / 1e12).toFixed(2) + '万亿'
          : (totalAmount / 1e8).toFixed(0) + '亿';
        headerEl.innerHTML = '大盘分析 &nbsp; <span class="amount-val">成交额 ' + amtStr + '</span>' +
          ' &nbsp; <span style="font-size:11px;color:var(--vscode-descriptionForeground)">正在加载涨跌分布...</span>';
      }

      // Breadth bar (from index API - authoritative data)
      const breadthWrap = document.getElementById('breadthBarWrap');
      if (breadthWrap && upCount != null) {
        const total = upCount + downCount + flatCount;
        const upPct = total > 0 ? (upCount / total * 100) : 0;
        const flatPct = total > 0 ? (flatCount / total * 100) : 0;
        const downPct = total > 0 ? (downCount / total * 100) : 0;
        breadthWrap.innerHTML =
          '<div class="breadth-bar">' +
            '<div class="up-part" style="width:' + upPct + '%"></div>' +
            '<div class="flat-part" style="width:' + flatPct + '%"></div>' +
            '<div class="down-part" style="width:' + downPct + '%"></div>' +
          '</div>' +
          '<div class="breadth-labels">' +
            '<span class="up-label">涨 ' + upCount + ' 家</span>' +
            '<span class="down-label">跌 ' + downCount + ' 家</span>' +
          '</div>';
      }
    }

    function renderMarketStats(stats, upCount, downCount, flatCount) {
      if (!stats) return;

      // Update header (remove loading text)
      const headerEl = document.getElementById('analysisHeader');
      if (headerEl) {
        const existing = headerEl.querySelector('.amount-val');
        const amtText = existing ? existing.outerHTML : '';
        headerEl.innerHTML = '大盘分析 &nbsp; ' + amtText;
      }

      // Bar chart (canvas)
      const chartCanvas = document.getElementById('marketChart');
      if (chartCanvas) {
        const dpr = window.devicePixelRatio || 1;
        const cw = chartCanvas.parentElement.clientWidth;
        const ch = chartCanvas.parentElement.clientHeight;
        chartCanvas.width = cw * dpr;
        chartCanvas.height = ch * dpr;
        chartCanvas.style.width = cw + 'px';
        chartCanvas.style.height = ch + 'px';
        const ctx = chartCanvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const bins = stats.bins;
        const labels = ['涨停', '>7%', '7~5%', '5~2%', '2~0%', '平', '0~2%', '2~5%', '5~7%', '7%<', '跌停'];
        const values = [bins.limitUp, bins.gt7, bins.gt5, bins.gt2, bins.gt0, bins.flat, bins.lt0, bins.lt2, bins.lt5, bins.lt7, bins.limitDown];

        // Dynamic colors: darkest for the highest-value bar in each side
        const maxUp = Math.max(...values.slice(0, 5), 1);
        const maxDown = Math.max(...values.slice(6, 11), 1);
        function lerpColor(c1, c2, t) {
          const r = Math.round(parseInt(c1.slice(1,3), 16) + (parseInt(c2.slice(1,3), 16) - parseInt(c1.slice(1,3), 16)) * t);
          const g = Math.round(parseInt(c1.slice(3,5), 16) + (parseInt(c2.slice(3,5), 16) - parseInt(c1.slice(3,5), 16)) * t);
          const b = Math.round(parseInt(c1.slice(5,7), 16) + (parseInt(c2.slice(5,7), 16) - parseInt(c1.slice(5,7), 16)) * t);
          return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
        }
        const RED_LIGHT = '#ffcdd2', RED_DARK = '#b71c1c';
        const GREEN_LIGHT = '#c8e6c9', GREEN_DARK = '#1b5e20';
        const colors = values.map((v, i) => {
          if (i === 5) return '#757575';
          if (i < 5) return lerpColor(RED_LIGHT, RED_DARK, v / maxUp);
          return lerpColor(GREEN_LIGHT, GREEN_DARK, v / maxDown);
        });

        const maxVal = Math.max(...values, 1);
        const padL = 8, padR = 8, padT = 14, padB = 30;
        const plotW = cw - padL - padR;
        const plotH = ch - padT - padB;
        const barW = plotW / labels.length;
        const gap = barW * 0.2;

        ctx.clearRect(0, 0, cw, ch);

        for (let i = 0; i < labels.length; i++) {
          const x = padL + i * barW + gap / 2;
          const bw = barW - gap;
          const bh = maxVal > 0 ? (values[i] / maxVal) * plotH : 0;
          const y = padT + plotH - bh;

          ctx.fillStyle = colors[i];
          ctx.beginPath();
          const r = Math.min(3, bw / 2);
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + bw - r, y);
          ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
          ctx.lineTo(x + bw, y + bh);
          ctx.lineTo(x, y + bh);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.fill();

          if (values[i] > 0) {
            ctx.fillStyle = colors[i];
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(values[i].toString(), x + bw / 2, y - 2);
          }

          ctx.fillStyle = '#aaa';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(labels[i], x + bw / 2, padT + plotH + 4);
        }
      }

      // Update breadth bar with real counts
      if (upCount != null) {
        const breadthWrap = document.getElementById('breadthBarWrap');
        if (breadthWrap) {
          const total = upCount + downCount + flatCount;
          const upPct = total > 0 ? (upCount / total * 100) : 0;
          const flatPct = total > 0 ? (flatCount / total * 100) : 0;
          const downPct = total > 0 ? (downCount / total * 100) : 0;
          breadthWrap.innerHTML =
            '<div class="breadth-bar">' +
              '<div class="up-part" style="width:' + upPct + '%"></div>' +
              '<div class="flat-part" style="width:' + flatPct + '%"></div>' +
              '<div class="down-part" style="width:' + downPct + '%"></div>' +
            '</div>' +
            '<div class="breadth-labels">' +
              '<span class="up-label">涨 ' + upCount + ' 家</span>' +
              '<span class="down-label">跌 ' + downCount + ' 家</span>' +
            '</div>';
        }
      }
    }

    function renderHeatmap(data) {
      const loadingEl = document.getElementById('heatmapLoading');
      const areaEl = document.getElementById('heatmapArea');
      const canvasEl = document.getElementById('heatmapCanvas');
      if (!loadingEl || !areaEl || !canvasEl) return;
      loadingEl.style.display = 'none';
      areaEl.style.display = 'flex';
      const ctx = canvasEl.getContext('2d');
      const container = areaEl;
      const W = container.clientWidth, H = container.clientHeight;
      if (W <= 0 || H <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = W * dpr; canvasEl.height = H * dpr;
      canvasEl.style.width = W + 'px'; canvasEl.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Squarify treemap
      function hmSquarify(parent, x0, y0, x1, y1) {
        const nodes = parent.children;
        if (!nodes || !nodes.length) return;
        const totalValue = nodes.reduce((s, n) => s + n.value, 0);
        if (totalValue <= 0) return;
        const area = (x1 - x0) * (y1 - y0);
        let remaining = [...nodes], row = [], rowSum = 0;
        while (remaining.length > 0) {
          const w = Math.min(x1 - x0, y1 - y0);
          if (w <= 0) break;
          const node = remaining[0];
          const nodeArea = (node.value / totalValue) * area;
          row.push({ node, area: nodeArea }); rowSum += nodeArea;
          if (row.length === 1) { remaining.shift(); continue; }
          const prev = hmWorst(row.slice(0, -1), rowSum - nodeArea, w);
          const curr = hmWorst(row, rowSum, w);
          if (curr > prev) {
            row.pop(); rowSum -= nodeArea;
            hmFlush(row, rowSum, x0, y0, x1, y1);
            const W2 = x1-x0, H2 = y1-y0, tall2 = H2 > W2;
            if (tall2) { y0 += W2 > 0 ? rowSum / W2 : 0; }
            else { x0 += H2 > 0 ? rowSum / H2 : 0; }
            row = []; rowSum = 0;
          } else { remaining.shift(); }
        }
        if (row.length) hmFlushLast(row, x0, y0, x1, y1);
      }
      function hmWorst(row, sum, w) {
        if (!row.length || sum === 0 || w === 0) return Infinity;
        let mx = 0; const s2 = sum * sum;
        for (const r of row) { const v = Math.max((w*w*r.area)/s2, s2/(w*w*r.area)); if(v>mx) mx=v; }
        return mx;
      }
      function hmFlushLast(row, x0, y0, x1, y1) {
        const cW = x1-x0, cH = y1-y0, tall = cH > cW;
        const totalArea = row.reduce((s,r) => s + r.area, 0);
        if (totalArea <= 0) return;
        if (tall) {
          let off = 0;
          for (const r of row) {
            const frac = r.area / totalArea;
            r.node.x0 = x0 + off; r.node.x1 = x0 + off + frac * cW;
            r.node.y0 = y0; r.node.y1 = y1;
            off += frac * cW;
          }
        } else {
          let off = 0;
          for (const r of row) {
            const frac = r.area / totalArea;
            r.node.x0 = x0; r.node.x1 = x1;
            r.node.y0 = y0 + off; r.node.y1 = y0 + off + frac * cH;
            off += frac * cH;
          }
        }
      }
      function hmFlush(row, rowSum, x0, y0, x1, y1) {
        const cW = x1-x0, cH = y1-y0, tall = cH > cW;
        if (tall) {
          const bandH = cW > 0 ? rowSum / cW : 0;
          let off = 0;
          for (let i = 0; i < row.length; i++) {
            const r = row[i];
            const itemW = bandH > 0 ? r.area / bandH : 0;
            r.node.x0 = x0 + off;
            r.node.x1 = i === row.length - 1 ? x0 + cW : x0 + off + itemW;
            r.node.y0 = y0; r.node.y1 = y0 + bandH;
            off += itemW;
          }
        } else {
          const bandW = cH > 0 ? rowSum / cH : 0;
          let off = 0;
          for (let i = 0; i < row.length; i++) {
            const r = row[i];
            const itemH = bandW > 0 ? r.area / bandW : 0;
            r.node.x0 = x0; r.node.x1 = x0 + bandW;
            r.node.y0 = y0 + off;
            r.node.y1 = i === row.length - 1 ? y1 : y0 + off + itemH;
            off += itemH;
          }
        }
      }

      // Layout sectors
      const names = Object.keys(data.sectors);
      if (!names.length) { showHeatmapError('暂无数据'); return; }
      const sectorNodes = names.map(name => {
        const stocks = data.sectors[name];
        const cap = stocks.reduce((s, st) => s + st.marketCap, 0);
        return { name, stocks, value: cap };
      }).filter(s => s.value > 0).sort((a,b) => b.value - a.value);
      const total = sectorNodes.reduce((s, n) => s + n.value, 0);
      if (total <= 0) return;
      const root = { children: sectorNodes, value: total };
      hmSquarify(root, 0, 0, W, H);
      const leaves = [];
      const HDR = 14;
      for (const sec of sectorNodes) {
        if (sec.x0 == null) continue;
        const sx0 = sec.x0+0.5, sy0 = sec.y0+HDR, sx1 = sec.x1-0.5, sy1 = sec.y1-0.5;
        if (sx1<=sx0 || sy1<=sy0) continue;
        const nodes = sec.stocks.map(st => ({...st, value: st.marketCap, sector: sec.name}))
          .filter(st => st.value > 0).sort((a,b) => b.value - a.value);
        const sr = { children: nodes, value: sec.value };
        hmSquarify(sr, sx0, sy0, sx1, sy1);
        for (const st of nodes) { if (st.x0 != null) leaves.push(st); }
        sec._b = { x0: sec.x0, y0: sec.y0, x1: sec.x1, y1: sec.y1 };
      }

      function hmColor(pct) {
        const c = Math.max(-10, Math.min(10, pct));
        const t = (c+10)/20;
        if (t < 0.42) { const g=t/0.42; return 'rgb('+Math.round(20+g*40)+','+Math.round(70+g*110)+','+Math.round(20+g*30)+')'; }
        if (t > 0.58) { const g=(t-0.58)/0.42; return 'rgb('+Math.round(170+g*70)+','+Math.round(70-g*50)+','+Math.round(50-g*30)+')'; }
        return '#555';
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#333'; ctx.fillRect(0, 0, W, H);
      // 1) Sector background fill
      for (const s of sectorNodes) {
        if (!s._b) continue;
        const b=s._b, sw=b.x1-b.x0, sh=b.y1-b.y0;
        if (sw<1||sh<1) continue;
        const avg = s.stocks && s.stocks.length > 0
          ? s.stocks.reduce((sum,st) => sum + (st.changePct||0), 0) / s.stocks.length : 0;
        ctx.fillStyle = hmColor(avg);
        ctx.fillRect(b.x0, b.y0, sw, sh);
      }
      // 2) Stock cells on top
      for (const l of leaves) {
        const lw=l.x1-l.x0, lh=l.y1-l.y0;
        if (lw<1||lh<1) continue;
        ctx.fillStyle = hmColor(l.changePct);
        ctx.fillRect(l.x0, l.y0, lw, lh);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
        ctx.strokeRect(l.x0, l.y0, lw, lh);
        if (lw>28 && lh>14) {
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const cx=l.x0+lw/2, cy=l.y0+lh/2;
          if (lh>28 && lw>38) {
            ctx.font = lw>60?'11px sans-serif':'9px sans-serif';
            ctx.fillText(l.name, cx, cy-7, lw-4);
            ctx.font='9px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.7)';
            ctx.fillText((l.changePct>=0?'+':'')+l.changePct.toFixed(2)+'%', cx, cy+7, lw-4);
          } else {
            ctx.font='9px sans-serif';
            ctx.fillText(l.name, cx, cy, lw-4);
          }
        }
      }
      // 3) Sector headers on top
      for (const s of sectorNodes) {
        if (!s._b) continue;
        const b=s._b, sw=b.x1-b.x0;
        if (sw<35) continue;
        ctx.fillStyle='rgba(0,0,0,0.55)';
        ctx.fillRect(b.x0, b.y0, sw, 14);
        ctx.fillStyle='#eee'; ctx.font='bold 10px sans-serif';
        ctx.textAlign='left'; ctx.textBaseline='top';
        ctx.fillText(s.name, b.x0+4, b.y0+2, sw-8);
      }

      // Tooltip
      const tooltipEl = document.getElementById('heatmapTooltip');
      canvasEl.addEventListener('mousemove', function(e) {
        const r = canvasEl.getBoundingClientRect();
        const x=e.clientX-r.left, y=e.clientY-r.top;
        const hit = leaves.find(l => x>=l.x0&&x<=l.x1&&y>=l.y0&&y<=l.y1);
        if (hit && tooltipEl) {
          const cls = hit.changePct>0?'up':hit.changePct<0?'down':'flat';
          const pct = (hit.changePct>=0?'+':'')+hit.changePct.toFixed(2)+'%';
          const cap = hit.marketCap>=1e12?(hit.marketCap/1e12).toFixed(2)+'万亿':(hit.marketCap/1e8).toFixed(1)+'亿';
          tooltipEl.innerHTML = '<b>'+hit.name+' ('+hit.code+')</b><br>涨跌幅: <span class="'+cls+'">'+pct+'</span><br>现价: '+hit.price.toFixed(2)+'<br>市值: '+cap+'<br>行业: '+hit.sector;
          tooltipEl.classList.add('visible');
          let tx=x+14, ty=y+14;
          if(tx+170>W) tx=x-170;
          if(ty+90>H) ty=y-90;
          tooltipEl.style.left=Math.max(0,tx)+'px'; tooltipEl.style.top=Math.max(0,ty)+'px';
          canvasEl.style.cursor='pointer';
        } else if (tooltipEl) { tooltipEl.classList.remove('visible'); canvasEl.style.cursor='default'; }
      });
      canvasEl.addEventListener('mouseleave', function() {
        if (tooltipEl) tooltipEl.classList.remove('visible');
      });
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
      
      vscode.postMessage({
        command: 'createGroup',
        name: groupName,
        stocks: []
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
    
    // Quick search box
    const quickSearchInput = document.getElementById('quickSearchInput');
    const searchDropdown = document.getElementById('searchResultsDropdown');
    let searchTimer = null;

    if (quickSearchInput) {
      quickSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const keyword = quickSearchInput.value.trim();
        if (!keyword) {
          searchDropdown.classList.remove('visible');
          searchDropdown.innerHTML = '';
          return;
        }
        searchTimer = setTimeout(() => {
          vscode.postMessage({ command: 'searchStock', keyword: keyword });
        }, 300);
      });

      quickSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          quickSearchInput.value = '';
          searchDropdown.classList.remove('visible');
          searchDropdown.innerHTML = '';
          quickSearchInput.blur();
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-add-box')) {
          searchDropdown.classList.remove('visible');
        }
      });
    }

    function renderSearchResults(localMatches, apiResults, isInGroup) {
      if (!searchDropdown) return;
      const hasLocal = localMatches && localMatches.length > 0;
      const hasApi = apiResults && apiResults.length > 0;

      if (!hasLocal && !hasApi) {
        searchDropdown.innerHTML = '<div class="search-no-result">未找到匹配的股票</div>';
        searchDropdown.classList.add('visible');
        return;
      }

      let html = '';
      if (hasLocal) {
        html += '<div class="search-section-header">已有股票（添加到当前分组）</div>';
        html += localMatches.map(r =>
          '<div class="search-result-item local-match" data-code="' + r.code + '">' +
            '<span class="search-result-name">' + r.name + '</span>' +
            '<span class="search-result-code">' + r.code.toUpperCase() + '</span>' +
            '<span class="search-result-add">+ 加入分组</span>' +
          '</div>'
        ).join('');
      }
      if (hasApi) {
        if (hasLocal) {
          html += '<div class="search-section-header">搜索新股票</div>';
        }
        html += apiResults.map(r =>
          '<div class="search-result-item api-match" data-code="' + r.code + '">' +
            '<span class="search-result-name">' + r.name + '</span>' +
            '<span class="search-result-code">' + r.code.toUpperCase() + '</span>' +
            '<span class="search-result-add">+ 添加</span>' +
          '</div>'
        ).join('');
      }

      searchDropdown.innerHTML = html;
      searchDropdown.classList.add('visible');

      searchDropdown.querySelectorAll('.local-match').forEach(item => {
        item.addEventListener('click', () => {
          const code = item.dataset.code;
          vscode.postMessage({ command: 'addToCurrentGroup', code: code });
          item.remove();
          if (!searchDropdown.querySelector('.search-result-item')) {
            searchDropdown.classList.remove('visible');
          }
        });
      });

      searchDropdown.querySelectorAll('.api-match').forEach(item => {
        item.addEventListener('click', () => {
          const code = item.dataset.code;
          vscode.postMessage({ command: 'quickAddStock', code: code });
          quickSearchInput.value = '';
          searchDropdown.classList.remove('visible');
          searchDropdown.innerHTML = '';
        });
      });
    }
    
    // Auto-load sector data if on sector page
    const sectorLoading = document.getElementById('sectorLoading');
    if (sectorLoading && sectorLoading.style.display !== 'none') {
      console.log('[Sector] Auto-loading sector data...');
      vscode.postMessage({ command: 'loadSectorData' });
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
