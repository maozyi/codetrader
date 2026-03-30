# 开发文档

本文档面向希望参与 CodeTrader 开发、进行二次开发或发布新版本的开发者。

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
├── DEVELOPMENT.md                 # 开发文档（本文件）
└── CHANGELOG.md                   # 更新日志
```

## 🔧 技术栈

- **VS Code Extension API** - 插件开发框架
- **Node.js** - 运行环境
- **Sina Finance API** - 股票数据源
- **WebView API** - 详情面板 UI

## 🚀 本地开发

### 环境准备

```bash
# 克隆项目
git clone https://github.com/maozyi/codetrader.git
cd codetrader

# 安装打包工具（全局安装一次即可）
npm install -g @vscode/vsce
```

### 开发模式

**方式1：调试模式（推荐）**
```bash
# 使用 VS Code 打开项目
code .

# 按 F5 启动调试模式
# 会打开新的 VSCode 窗口，插件已自动加载
# 可以在原窗口设置断点进行调试
```

**方式2：快速重新编译**
```bash
# 修改代码后，快速重新编译并安装到当前 VSCode
npm run rebuild

# 重新加载 VSCode 窗口
# 按 Ctrl+Shift+P → 输入 "Reload Window" → 回车
```

### 开发工作流

```bash
# 1. 修改代码
vim src/ui/statusBar.js

# 2. 重新编译并安装
npm run rebuild

# 3. 重新加载 VSCode 窗口
# 按 Ctrl+Shift+P → 输入 "Reload Window" → 回车

# 4. 测试功能

# 5. 重复步骤 1-4 直到功能完成
```

更多开发脚本说明请查看 [scripts/README.md](scripts/README.md)。

### 本地打包

```bash
# 打包生成 .vsix 文件
npm run package

# 生成的文件：codetrader-x.x.x.vsix
```

### 本地安装测试

```bash
# 安装刚打包的 .vsix 文件
npm run install-local

# 或手动安装
code --install-extension codetrader-x.x.x.vsix
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交规范

提交信息格式：`<type>: <description>`

**类型（type）：**
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链相关
- `release`: 版本发布

**示例：**
```bash
git commit -m "feat: add stock group management"
git commit -m "fix: correct stock price field"
git commit -m "docs: update README with new features"
```

### 开发建议

1. 修改前先运行 `npm run rebuild` 确保环境正常
2. 使用 F5 调试模式测试新功能
3. 提交前确保代码通过语法检查：`node -c src/**/*.js`
4. 更新 CHANGELOG.md 记录变更
5. 遵循项目现有的代码风格

## 📦 版本发布

### 🏷️ 版本号规范

遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 规范：

- **主版本号（Major）**：不兼容的 API 修改
  - 例如：1.0.0 -> 2.0.0
  
- **次版本号（Minor）**：向下兼容的功能新增
  - 例如：1.4.0 -> 1.5.0
  
- **修订号（Patch）**：向下兼容的问题修正
  - 例如：1.5.0 -> 1.5.1

### 🚀 自动发布流程（推荐）

项目已配置 GitHub Actions 自动发布流程，当推送带版本号的 tag 时会自动触发。

**步骤：**

```bash
# 1. 更新版本号
# 编辑 package.json 中的 version 字段
# 例如：1.4.0 -> 1.5.0

# 2. 更新 CHANGELOG.md
# 添加新版本的更新内容

# 3. 提交版本更新
git add package.json CHANGELOG.md
git commit -m "release: prepare v1.5.0"

# 4. 创建并推送版本标签
git tag v1.5.0
git push origin main
git push origin v1.5.0
```

**自动化流程：**

推送 tag 后，GitHub Actions 会自动：
1. ✅ 检出代码
2. ✅ 安装 Node.js 环境
3. ✅ 安装 vsce 打包工具
4. ✅ 打包生成 `.vsix` 文件
5. ✅ 创建 GitHub Release
6. ✅ 上传 `.vsix` 文件到 Release
7. ✅ 自动生成安装说明

### 📝 手动发布流程

如果需要手动发布（例如 GitHub Actions 不可用）：

```bash
# 1. 本地打包
npm run package

# 2. 创建 Release
# 在 GitHub 仓库页面：
# - 点击 "Releases"
# - 点击 "Draft a new release"
# - 填写 Tag version（如 v1.5.0）
# - 填写 Release title（如 v1.5.0）
# - 在描述中粘贴 CHANGELOG.md 中的对应内容
# - 上传生成的 .vsix 文件
# - 点击 "Publish release"
```

### ✅ 发布前检查清单

- [ ] 更新 `package.json` 中的 `version` 字段
- [ ] 更新 `CHANGELOG.md` 添加新版本内容
- [ ] 在本地测试插件功能正常
- [ ] 确认 `.gitignore` 正确配置，不包含不必要的文件
- [ ] 提交所有更改并推送到 main 分支
- [ ] 创建并推送版本标签
- [ ] 验证 GitHub Actions 执行成功
- [ ] 检查 Release 页面 `.vsix` 文件正确上传
- [ ] 下载 `.vsix` 测试安装

### ⚠️ 注意事项

1. **标签格式**：必须是 `v` + 版本号，如 `v1.5.0`
2. **版本一致性**：tag 版本号应与 `package.json` 中一致
3. **已发布版本**：已推送的 tag 不要修改或删除
4. **Release 描述**：建议从 `CHANGELOG.md` 复制对应版本内容
5. **测试安装**：发布后应下载 `.vsix` 测试能否正常安装

### 🔍 故障排查

**GitHub Actions 未触发？**
- 检查 tag 格式是否正确（必须是 `v*.*.*`）
- 确认 `.github/workflows/release.yml` 文件存在
- 查看仓库 Actions 页面的错误日志

**打包失败？**
- 检查 `package.json` 配置是否完整
- 确认 `publisher` 字段已填写
- 本地运行 `vsce package` 测试

**上传失败？**
- 检查 GitHub Token 权限
- 确认仓库设置中 Actions 有写权限

## 🙏 致谢

感谢原项目 [watch-stock](https://github.com/pbstar/watch-stock) 作者 [@pbstar](https://github.com/pbstar) 的开源贡献，为本项目提供了坚实的基础。

## 📄 开源协议

本项目采用 [MIT 开源协议](LICENSE.txt)。
