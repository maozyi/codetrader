# 🚀 CodeTrader VS Code 插件

一个轻量极简的 VS Code 股票实时查看插件，让您在编码的同时轻松掌握股市动态。

> **低调摸鱼，专注看盘** 🤫

## 📖 关于本项目

### 项目来源
本项目基于 [watch-stock](https://github.com/pbstar/watch-stock) 进行二次开发和优化。

### 改进说明
**为什么改名为 CodeTrader？**
- 🤫 **更隐蔽**：将"摸鱼看盘"改为"CodeTrader"，看起来更像是一个专业的代码工具
- 🎭 **更低调**：移除明显的股票图标，不易被发现
- 💼 **更专业**：外表看起来像是开发工具，实则暗藏看盘功能
- 🎯 **贯彻摸鱼精神**：低调行事，高效摸鱼

**主要优化：**
- ✨ **分组管理**：自定义股票分组，支持新建、重命名、删除、拖拽排序
- ✨ **批量操作**：勾选股票批量移除，分组内独立管理不影响全局
- 🎨 **详情面板增强**：支持彩色模式、固定页面、列头排序等功能
- 📊 **灵活排序**：点击列头按现价、涨跌、涨跌幅排序，支持升序/降序切换
- 🖱️ **智能交互**：单击状态栏显示详情面板，右键分组标签快速操作
- 📌 **可选固定**：详情面板支持固定模式，鼠标离开不自动关闭
- 📋 **完美对齐**：详情面板表格列完美对齐，数据清晰易读
- 🎯 **快速提示**：自定义 tooltip，200ms 快速显示，不遮挡内容
- 🔧 **开发工具**：添加自动化构建脚本，方便二次开发
- 🚀 **扩展预留**：为未来图表功能（分时图、K线图）预留接口

## ✨ 核心功能

- 📈 **实时行情** - 状态栏实时显示股票价格和涨跌幅
- 📊 **股票看板** - 侧边栏分类显示指数、板块和自选股
- 📁 **分组管理** - 自定义股票分组，支持拖拽排序和独立管理
- ✅ **批量操作** - 勾选股票批量移除，分组内移除不影响全局
- 🔔 **异动监控** - 监控自选股票异动，行情变化不错过
- 👁️ **显示/隐藏** - 一键隐藏/显示状态栏股票信息
- ⌨️ **快捷键** - 支持快捷键快速切换显示/隐藏

## 📦 安装

### 方式1：插件市场安装（推荐）⭐

**VS Code / Cursor / 其他兼容 IDE：**
1. 打开扩展面板（`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
2. 搜索 `CodeTrader`
3. 点击安装

**在线安装：**
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=7236202.codetrader)
- [Open VSX Registry](https://open-vsx.org/extension/7236202/codetrader)

---

### 方式2：下载安装包

从 [Releases](https://github.com/maozyi/codetrader/releases) 页面下载最新版本的 `.vsix` 文件。

**图形界面安装：**
1. 下载 `codetrader-x.x.x.vsix` 文件
2. 在 VSCode 中按 `Ctrl+Shift+X` 打开扩展面板
3. 点击右上角 `···` 菜单
4. 选择 **"从 VSIX 安装..."**
5. 选择下载的文件
6. 重新加载窗口

**命令行安装：**
```bash
code --install-extension codetrader-x.x.x.vsix
```

---

### 方式3：源码构建安装

**快速构建：**
```bash
# 1. 克隆项目
git clone https://github.com/maozyi/codetrader.git
cd codetrader

# 2. 安装打包工具
npm install -g @vscode/vsce

# 3. 自动构建并安装
npm run rebuild

# 4. 重新加载 VSCode 窗口
# 按 Ctrl+Shift+P → 输入 "Reload Window" → 回车
```

**手动构建：**
```bash
# 1. 克隆项目
git clone https://github.com/maozyi/codetrader.git
cd codetrader

# 2. 安装打包工具并打包
npm install -g @vscode/vsce
npm run package

# 3. 安装到 VSCode
code --install-extension codetrader-1.4.0.vsix
```

---

## 💡 使用技巧

### 分组管理
1. 点击详情面板右上角"管理"按钮，选择"新建分组"
2. 输入分组名称（如"光伏概念"、"芯片板块"），选择股票
3. 右键分组标签可重命名、添加股票或删除分组
4. 拖拽分组标签可调整显示顺序

### 批量操作
1. 在详情面板中勾选要移除的股票
2. 点击"确认移除"按钮
3. 在分组标签页中移除，仅从该分组移除，不影响全局列表

### 快捷键
- `Ctrl+Alt+S` (Mac: `Cmd+Alt+S`) - 切换显示/隐藏状态栏

## ⚙️ 配置选项

在 VS Code 设置中搜索 `codetrader`，可配置以下选项：

| 配置项                            | 类型    | 默认值         | 说明                                       |
| --------------------------------- | ------- | -------------- | ------------------------------------------ |
| `codetrader.stocks`              | array   | `["sh000001"]` | 自选股票代码表                             |
| `codetrader.stockGroups`         | array   | `[]`           | 股票分组列表（自动管理）                   |
| `codetrader.indices`             | array   | `[...]`        | 指数代码列表(在股票看板中显示)             |
| `codetrader.sectors`             | array   | `[...]`        | 板块代码列表(在股票看板中显示)             |
| `codetrader.maxDisplayCount`     | number  | `5`            | 状态栏最大显示股票数量                     |
| `codetrader.showTwoLetterCode`   | boolean | `false`        | 状态栏是否显示 2 位简称                    |
| `codetrader.enableMonitor`       | boolean | `false`        | 是否开启自选股票异动监控                   |

### 配置示例

```json
{
  "codetrader.stocks": ["sh600519", "sz000001", "sh601318"],
  "codetrader.indices": ["sh000001", "sz399001", "sz399006"],
  "codetrader.sectors": ["sh512760", "sh512690", "sh512170"],
  "codetrader.maxDisplayCount": 3,
  "codetrader.showTwoLetterCode": true,
  "codetrader.enableMonitor": true
}
```

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/maozyi/codetrader
- **问题反馈**: https://github.com/maozyi/codetrader/issues
- **开发文档**: [DEVELOPMENT.md](https://github.com/maozyi/codetrader/blob/main/DEVELOPMENT.md)
- **更新日志**: [CHANGELOG.md](https://github.com/maozyi/codetrader/blob/main/CHANGELOG.md)

## 🙏 致谢

感谢原项目 [watch-stock](https://github.com/pbstar/watch-stock) 作者 [@pbstar](https://github.com/pbstar) 的开源贡献，为本项目提供了坚实的基础。

## 📄 开源协议

本项目采用 [MIT 开源协议](LICENSE.txt)。

---