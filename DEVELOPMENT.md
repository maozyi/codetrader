# 开发文档

本文档面向希望参与 CodeTrader 开发或进行二次开发的开发者。

## 🚀 开发说明

### 本地开发

```bash
# 克隆项目
git clone https://github.com/maozyi/codetrader.git
cd codetrader

# 使用 VS Code 打开项目
# 按 F5 启动调试模式（会打开新窗口测试插件）

# 或快速重新编译并安装到当前 VSCode
npm run rebuild
```

### 开发工作流

```bash
# 1. 修改代码
vim src/managers/stockManager.js

# 2. 重新编译并安装
npm run rebuild

# 3. 重新加载 VSCode 窗口
# 按 Ctrl+Shift+P → 输入 "Reload Window" → 回车

# 4. 测试功能
```

更多开发脚本说明请查看 [scripts/README.md](scripts/README.md)。

### 本地打包

```bash
# 安装打包工具
npm install -g @vscode/vsce

# 打包插件
npm run package
```

## 📁 项目结构

```
codetrader/
├── src/
│   ├── extension.js               # 主入口文件
│   ├── config.js                  # 配置管理
│   ├── managers/                  # 业务管理模块
│   │   └── stockManager.js        # 股票管理器
│   ├── pages/                     # 页面模块
│   │   └── stockView.js           # 股票看板视图
│   ├── services/                  # 服务层
│   │   └── stockService.js        # 股票数据服务
│   ├── ui/                        # UI 层
│   │   └── statusBar.js           # 状态栏管理
│   └── utils/                     # 工具函数
│       ├── httpClient.js          # HTTP 客户端
│       ├── monitor.js             # 异动监控
│       └── ...
├── scripts/                       # 开发脚本
│   ├── rebuild.sh                 # 快速重新编译安装
│   ├── dev.sh                     # 开发监听模式
│   └── README.md                  # 脚本使用说明
├── images/                        # 图片资源
├── docs/                          # 文档
├── package.json                   # 插件配置
├── README.md                      # 用户文档
├── INTRO.md                       # 插件市场简介
├── DEVELOPMENT.md                 # 开发文档（本文件）
└── CHANGELOG.md                   # 更新日志
```

## 🔧 技术栈

- **VS Code Extension API** - 插件开发框架
- **Node.js** - 运行环境
- **Sina Finance API** - 股票数据源
- **WebView API** - 详情面板 UI

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交规范

提交信息格式：`<type>: <description>`

类型（type）：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链相关

### 开发建议

1. 修改前先运行 `npm run rebuild` 确保环境正常
2. 使用 F5 调试模式测试新功能
3. 提交前确保代码通过语法检查：`node -c src/**/*.js`
4. 更新 CHANGELOG.md 记录变更

## 📦 发布流程

```bash
# 1. 更新版本号
# 编辑 package.json 中的 version 字段

# 2. 更新 CHANGELOG.md
# 记录本版本的所有变更

# 3. 打包
npm run package

# 4. 测试安装
code --install-extension codetrader-x.x.x.vsix

# 5. 发布到市场
vsce publish

# 6. 创建 GitHub Release
# 上传 .vsix 文件到 Release
```

## 🙏 致谢

感谢原项目 [watch-stock](https://github.com/pbstar/watch-stock) 作者 [@pbstar](https://github.com/pbstar) 的开源贡献。

## 📄 开源协议

本项目采用 [MIT 开源协议](LICENSE.txt)。
