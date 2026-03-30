# CodeTrader - 股票监控插件

一个轻量极简的股票实时查看插件，让您在编码的同时轻松掌握股市动态。

> **推荐使用 Cursor**：本插件主要在 Cursor 中开发和测试，推荐在 Cursor 中使用以获得最佳体验。VS Code 下未作完整兼容性测试。

## 核心功能

- **实时行情** - 状态栏实时显示股票价格和涨跌幅
- **详情面板** - 单击状态栏查看完整股票列表，支持排序和筛选
- **股票看板** - 侧边栏分类显示指数、板块和自选股
- **分组管理** - 自定义股票分组，支持重命名、拖拽排序
- **批量操作** - 勾选股票批量移除，分组内独立管理
- **异动监控** - 可选的股票异动提醒功能

## 快速开始

1. 安装插件后，点击活动栏的 CodeTrader 图标
2. 单击状态栏查看详情面板
3. 点击"管理"按钮添加股票，或创建自定义分组
4. 使用快捷键 `Ctrl+Alt+S` (Mac: `Cmd+Alt+S`) 切换显示/隐藏

## 详情面板功能

- **彩色模式** - 开启后根据涨跌显示红绿颜色
- **固定页面** - 开启后鼠标离开页面不会自动关闭详情页
- **列头排序** - 点击现价、涨跌、涨跌幅列头进行排序
- **批量管理** - 勾选股票后批量移除
- **分组管理** - 自定义股票分组，支持重命名、拖拽排序
- **分组独立** - 每个分组可独立添加和移除股票，不影响全局列表

## 使用技巧

### 分组管理
1. 点击详情面板右上角"管理"按钮，选择"新建分组"
2. 输入分组名称（如"光伏概念"、"芯片板块"），选择股票
3. 右键分组标签可重命名、添加股票或删除分组
4. 拖拽分组标签可调整显示顺序

### 批量操作
1. 在详情面板中勾选要移除的股票
2. 点击"确认移除"按钮
3. 在分组标签页中移除，仅从该分组移除，不影响全局列表

## 支持的股票格式

- 股票代码：`sh600519`（上交所）、`sz000001`（深交所）、`bj430047`（北交所）
- 中文名称：`贵州茅台`、`中国平安` 等

## 配置选项

在 VS Code 设置中搜索 `codetrader` 可配置：
- 自选股票列表
- 股票分组（自动管理）
- 状态栏最大显示数量
- 是否显示简称
- 异动监控开关

## 安装方式

### 插件市场安装（推荐）

**在 Cursor 中安装：**
1. 打开扩展面板（`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
2. 搜索 `CodeTrader`
3. 点击安装

**在线安装：**
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=7236202.codetrader)
- [Open VSX Registry](https://open-vsx.org/extension/7236202/codetrader)

> 注：推荐在 Cursor 中使用，VS Code 下可能存在兼容性问题

### VSIX 文件安装

从 [Releases](https://github.com/maozyi/codetrader/releases) 页面下载最新版本的 `.vsix` 文件。

**图形界面安装：**
1. 下载 `codetrader-x.x.x.vsix` 文件
2. 在 Cursor 中按 `Ctrl+Shift+X` 打开扩展面板
3. 点击右上角 `···` 菜单
4. 选择 **"从 VSIX 安装..."**
5. 选择下载的文件
6. 重新加载窗口

**命令行安装：**
```bash
# Cursor
cursor --install-extension codetrader-x.x.x.vsix

# VS Code (可能存在兼容性问题)
code --install-extension codetrader-x.x.x.vsix
```

## 相关链接

- **GitHub 仓库**: https://github.com/maozyi/codetrader
- **问题反馈**: https://github.com/maozyi/codetrader/issues
- **开发文档**: [DEVELOPMENT.md](https://github.com/maozyi/codetrader/blob/main/DEVELOPMENT.md)
- **更新日志**: [CHANGELOG.md](https://github.com/maozyi/codetrader/blob/main/CHANGELOG.md)

## 致谢

感谢原项目 [watch-stock](https://github.com/pbstar/watch-stock) 作者 [@pbstar](https://github.com/pbstar) 的开源贡献，为本项目提供了坚实的基础。

## 开源协议

本项目采用 [MIT 开源协议](LICENSE.txt)。
