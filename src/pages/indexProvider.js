/**
 * 股票首页视图提供者
 * 在侧边栏显示指数、板块和自选股票（按分组展示）
 */

const vscode = require("vscode");
const { getStocks, getIndices, getSectors, getStockGroups } = require("../config");
const { getStockList } = require("../services/stockService");

class IndexProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._stockData = { indices: [], sectors: [], allStocks: [], groups: [] };
    this._showPage = false;
  }

  setShowPage(visible) {
    this._showPage = visible;
    if (visible) {
      this.refresh();
    }
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // Top-level categories
      const items = [
        new StockCategory("指数", "indices"),
        new StockCategory("板块", "sectors"),
      ];

      // Self-selected stocks: show groups if any, otherwise flat
      const groups = this._stockData.groups;
      if (groups.length > 0) {
        // Parent "自选" with children for each group + "全部"
        items.push(new StockCategory("自选", "watchlist", vscode.TreeItemCollapsibleState.Expanded));
      } else {
        // Flat list under "自选"
        items.push(new StockCategory("自选", "all-stocks-flat"));
      }
      return items;
    }

    if (element.type === "indices") {
      return this._stockData.indices.map((s) => new StockItem(s));
    }
    if (element.type === "sectors") {
      return this._stockData.sectors.map((s) => new StockItem(s));
    }
    if (element.type === "all-stocks-flat") {
      return this._stockData.allStocks.map((s) => new StockItem(s));
    }
    if (element.type === "watchlist") {
      // Show "全部" + each group as subcategories
      const children = [
        new StockCategory(`全部 (${this._stockData.allStocks.length})`, "all-stocks"),
      ];
      for (const g of this._stockData.groups) {
        const count = this._stockData.allStocks.filter((s) => g.stocks.includes(s.code)).length;
        children.push(new StockCategory(`${g.name} (${count})`, `group-${g.id}`));
      }
      return children;
    }
    if (element.type === "all-stocks") {
      return this._stockData.allStocks.map((s) => new StockItem(s));
    }
    if (element.type && element.type.startsWith("group-")) {
      const groupId = element.type.replace("group-", "");
      const group = this._stockData.groups.find((g) => g.id === groupId);
      if (group) {
        return this._stockData.allStocks
          .filter((s) => group.stocks.includes(s.code))
          .map((s) => new StockItem(s));
      }
    }

    return [];
  }

  async refresh() {
    try {
      const indexCodes = getIndices();
      const sectorCodes = getSectors();
      const userStocks = getStocks();
      const groups = getStockGroups();

      const allCodes = [
        ...new Set([...indexCodes, ...sectorCodes, ...userStocks]),
      ];
      const allData = await getStockList(allCodes);

      const sortByChange = (a, b) =>
        parseFloat(b.changePercent) - parseFloat(a.changePercent);

      const allStockData = allData
        .filter((stock) => userStocks.includes(stock.code))
        .sort(sortByChange);

      this._stockData = {
        indices: allData.filter((stock) => indexCodes.includes(stock.code)),
        sectors: allData
          .filter((stock) => sectorCodes.includes(stock.code))
          .sort(sortByChange),
        allStocks: allStockData,
        groups,
      };

      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error("刷新数据失败:", error);
    }
  }

  updateData() {
    if (!this._showPage) return;
    this.refresh();
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

class StockCategory {
  constructor(label, type, collapsibleState) {
    this.label = label;
    this.type = type;
    this.collapsibleState = collapsibleState || vscode.TreeItemCollapsibleState.Expanded;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.contextValue = "category";
  }
}

class StockItem {
  constructor(stock) {
    const isUp = parseFloat(stock.change) >= 0;
    this.label = `${stock.name} ${stock.current}`;
    this.description = `${isUp ? "+" : ""}${stock.changePercent}%`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    this.iconPath = isUp
      ? new vscode.ThemeIcon("arrow-up", new vscode.ThemeColor("charts.red"))
      : new vscode.ThemeIcon("arrow-down", new vscode.ThemeColor("charts.green"));
    this.contextValue = "stockItem";
  }
}

module.exports = IndexProvider;
