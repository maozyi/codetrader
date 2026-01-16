# 🚀 CodeTrader VS Code 插件

一个轻量极简的 VS Code 股票实时查看插件，让您在编码的同时轻松掌握股市动态。

## ✨ 核心功能

- 📈 **实时行情** 状态栏实时显示股票价格和涨跌幅
- 📊 **股票看板** 侧边栏分类显示指数、板块和自选股
- 🔔 **异动监控** 监控自选股票异动，行情变化不错过
- 👁️ **显示/隐藏** 一键隐藏/显示状态栏股票信息
- ⌨️ **快捷键** 支持快捷键快速切换显示/隐藏

## 🎯 快速开始

### 使用步骤

1. **查看股票看板**：点击活动栏的"CodeTrader"图标，打开侧边栏查看指数、板块和自选股
2. **添加自选股**：点击状态栏或侧边栏齿轮图标，选择"添加自选股票"，输入股票代码或名称
3. **管理股票**：点击状态栏或侧边栏齿轮图标，可添加、移除、清空自选股票列表
4. **显示/隐藏**：
   - 点击状态栏或使用命令面板
   - 使用快捷键：`Ctrl+Alt+S`（Windows/Linux）或 `Cmd+Alt+S`（macOS）
5. **手动刷新**：点击状态栏 → 选择"刷新行情数据" 或 使用命令面板
6. **个性化配置**：在 VS Code 设置中搜索 `watch-stock`，可配置股票、指数、板块列表、最大显示数量、是否显示 2 位简称、是否开启异动监控等

## 📋 支持的输入格式

- **股票代码**：`sh600519`（上交所）、`sz000001`（深交所）、`bj430047`（北交所）
- **中文名称**：`贵州茅台`、`中国平安` 等

## ⚙️ 配置选项

在 VS Code 设置中搜索 `watch-stock`，可配置以下选项：

| 配置项                          | 类型    | 默认值         | 说明                           |
| ------------------------------- | ------- | -------------- | ------------------------------ |
| `codetrader.stocks`            | array   | `["sh000001"]` | 自选股票代码表                 |
| `codetrader.indices`           | array   | `[...]`        | 指数代码列表(在股票看板中显示) |
| `codetrader.sectors`           | array   | `[...]`        | 板块代码列表(在股票看板中显示) |
| `codetrader.maxDisplayCount`   | number  | `5`            | 状态栏最大显示股票数量         |
| `codetrader.showTwoLetterCode` | boolean | `false`        | 状态栏是否显示 2 位简称        |
| `codetrader.enableMonitor`     | boolean | `false`        | 是否开启自选股票异动监控       |

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


## 🚀 开发说明

### 本地开发

```bash
# 克隆项目
git clone https://github.com/pbstar/codetrader.git
cd watch-stock

# 使用 VS Code 打开项目
# 按 F5 启动调试模式

# 本地打包并自动安装
npm run rebuild
```

### 打包发布

```bash
# 安装打包工具
npm install -g @vscode/vsce

# 打包插件
vsce package

# 发布到 VS Code 市场
vsce publish

# 发布到 Open VSX
ovsx publish
```

### 项目结构

```
watch-stock/
├── src/
│   ├── extension.js               # 主入口文件
│   ├── config.js                  # 配置管理
│   ├── managers/                  # 业务管理模块
│   ├── pages/                     # 页面模块
│   ├── services/                  # 服务层
│   ├── ui/                        # UI 层
│   └── utils/                     # 工具函数
├── images/                        # 图片资源
├── package.json                   # 插件配置
└── README.md                      # 说明文档
```


## 📄 开源协议

本项目采用 [MIT 开源协议](https://github.com/pbstar/watch-stock/blob/main/LICENSE)。

---