#!/bin/bash

# CodeTrader 插件自动编译安装脚本
# 用途：快速重新编译并安装插件到 VSCode

set -e  # 遇到错误立即退出

echo "🚀 开始重新编译 CodeTrader 插件..."

# 进入项目目录
cd "$(dirname "$0")/.."

# 1. 卸载旧版本
echo "📦 卸载旧版本插件..."
code --uninstall-extension pbstar.codetrader 2>/dev/null || echo "   (没有已安装的版本)"

# 2. 清理旧的打包文件
echo "🧹 清理旧的打包文件..."
rm -f *.vsix

# 3. 重新打包
echo "📦 重新打包插件..."
vsce package

# 4. 安装新版本
echo "🔧 安装新版本插件..."
VSIX_FILE=$(ls -t *.vsix | head -1)
code --install-extension "$VSIX_FILE" --force

echo ""
echo "✅ 插件重新编译并安装完成！"
echo "📋 打包文件: $VSIX_FILE"
echo ""
echo "⚠️  请执行以下操作之一以加载新版本："
echo "   1. 按 Ctrl+Shift+P → 输入 'Reload Window' → 回车"
echo "   2. 完全重启 VSCode"
echo ""
