/**
 * CodeTrader - VS Code股票实时查看插件
 */

const vscode = require("vscode");
const StatusBarManager = require("./ui/statusBar");
const StockManager = require("./managers/stockManager");
const IndexProvider = require("./pages/indexProvider");
const HeatmapProvider = require("./pages/heatmapProvider");
const { getStocks } = require("./config");
const { isTradingTime } = require("./utils/tradingTime");

// 全局变量
let statusBarManager;
let stockManager;
let refreshInterval;
let indexProvider;
let heatmapProvider;

/**
 * 插件激活函数
 */
function activate(context) {
  console.log("CodeTrader插件已启动");

  // 初始化管理器
  statusBarManager = new StatusBarManager();
  stockManager = new StockManager();
  heatmapProvider = new HeatmapProvider();


  // 注册侧边栏视图
  indexProvider = new IndexProvider();
  const treeView = vscode.window.createTreeView("watchStockIndex", {
    treeDataProvider: indexProvider,
  });

  // 监听股票看板可见性变化
  treeView.onDidChangeVisibility((event) => {
    indexProvider.setShowPage(event.visible);
    console.log(`股票看板可见性: ${event.visible ? "显示" : "隐藏"}`);
  });

  context.subscriptions.push(treeView);

  // 添加 IndexProvider 到订阅中，确保正确清理
  context.subscriptions.push(indexProvider);

  // 初始化状态栏
  statusBarManager.initialize();

  // 大盘云图状态栏入口
  const heatmapStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  heatmapStatusBarItem.text = "$(flame) 云图";
  heatmapStatusBarItem.tooltip = "大盘云图 - 点击全屏查看 A 股热力图";
  heatmapStatusBarItem.command = "codetrader.showHeatmap";
  heatmapStatusBarItem.show();
  context.subscriptions.push(heatmapStatusBarItem);
  
  // Set stock manager for detail panel management
  statusBarManager.setStockManager(stockManager, () => {
    statusBarManager.updateData();
    indexProvider.updateData();
  });

  // 注册命令
  registerCommands(context);

  // 监听配置变化，自动更新定时器
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      // 刷新股票数据
      statusBarManager.updateData();
      indexProvider.updateData();
    }
  );
  context.subscriptions.push(configChangeListener);

  // 开始定时更新
  startRefreshTimer();
  // 初始化时先刷新一次数据
  statusBarManager.updateData();
  indexProvider.updateData();

  // 后台预热大盘+云图数据缓存，首次打开即可秒出
  try {
    const { refreshAll } = require("./services/marketService");
    refreshAll();
  } catch (e) { /* silent */ }
  try {
    const { fetchHeatmapData } = require("./services/heatmapService");
    fetchHeatmapData();
  } catch (e) { /* silent */ }
}

/**
 * 注册所有命令
 */
function registerCommands(context) {
  // 添加自选股票
  const addStockCommand = vscode.commands.registerCommand(
    "codetrader.addStock",
    () =>
      stockManager.addStock(() => {
        statusBarManager.updateData();
        indexProvider.updateData();
      })
  );

  // 移除自选股票
  const removeStockCommand = vscode.commands.registerCommand(
    "codetrader.removeStock",
    () =>
      stockManager.removeStock(() => {
        statusBarManager.updateData();
        indexProvider.updateData();
      })
  );

  // 清空自选股票
  const clearStocksCommand = vscode.commands.registerCommand(
    "codetrader.clearStocks",
    () =>
      stockManager.clearStocks(() => {
        statusBarManager.updateData();
        indexProvider.updateData();
      })
  );


  // 切换显示/隐藏
  const toggleVisibilityCommand = vscode.commands.registerCommand(
    "codetrader.toggleVisibility",
    () => {
      statusBarManager.toggleVisibility();
    }
  );

  // 刷新行情数据
  const refreshDataCommand = vscode.commands.registerCommand(
    "codetrader.refreshData",
    async () => {
      await statusBarManager.updateData();
      await indexProvider.updateData();
      vscode.window.showInformationMessage("股票行情数据刷新完成");
    }
  );

  // 显示悬浮框
  const showHoverPanelCommand = vscode.commands.registerCommand(
    "codetrader.showHoverPanel",
    () => {
      statusBarManager.showHoverPanel();
    }
  );

  // 显示大盘云图
  const showHeatmapCommand = vscode.commands.registerCommand(
    "codetrader.showHeatmap",
    () => {
      heatmapProvider.show();
    }
  );

  // 注册所有命令到订阅
  context.subscriptions.push(
    statusBarManager.getStatusBarItem(),
    addStockCommand,
    removeStockCommand,
    clearStocksCommand,
    toggleVisibilityCommand,
    refreshDataCommand,
    showHoverPanelCommand,
    showHeatmapCommand
  );
}

/**
 * 启动定时刷新
 */
function startRefreshTimer() {
  // 清除现有定时器
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // 设置新的定时器，只在交易时间内刷新
  refreshInterval = setInterval(() => {
    if (isTradingTime()) {
      // 同时更新状态栏和指数视图
      statusBarManager.updateData();
      indexProvider.updateData();
    } else {
      console.log("当前非交易时间，跳过刷新");
    }
  }, 5000);
}

/**
 * 插件停用函数
 */
function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (statusBarManager) {
    statusBarManager.dispose();
  }
  if (indexProvider) {
    indexProvider.dispose();
  }
  if (heatmapProvider) {
    heatmapProvider.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
