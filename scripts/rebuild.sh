#!/bin/bash

# CodeTrader 插件自动编译安装脚本
# 用途：快速重新编译并安装插件到 Cursor/VSCode

set -e  # 遇到错误立即退出

echo "🚀 开始重新编译 CodeTrader 插件..."

# 进入项目目录
cd "$(dirname "$0")/.."

# 检测使用 cursor 还是 code 命令
if command -v cursor &> /dev/null; then
    CMD="cursor"
    IDE_NAME="Cursor"
elif command -v code &> /dev/null; then
    CMD="code"
    IDE_NAME="VSCode"
else
    echo "❌ 错误: 未找到 cursor 或 code 命令"
    exit 1
fi

echo "📍 检测到 $IDE_NAME，使用 $CMD 命令"

# 1. 卸载旧版本
echo "📦 卸载旧版本插件..."
$CMD --uninstall-extension 7236202.codetrader 2>/dev/null || echo "   (没有已安装的版本)"

# 2. 清理旧的打包文件
echo "🧹 清理旧的打包文件..."
rm -f *.vsix

# 3. 重新打包
echo "📦 重新打包插件..."
vsce package

# 4. 安装新版本
echo "🔧 安装新版本插件..."
VSIX_FILE=$(ls -t *.vsix | head -1)

# 尝试安装，如果失败则提示手动安装
if $CMD --install-extension "$VSIX_FILE" --force 2>/dev/null; then
    echo ""
    echo "✅ 插件重新编译并安装完成！"
    echo "📋 打包文件: $VSIX_FILE"
    echo ""
    echo "⚠️  请执行以下操作之一以加载新版本："
    echo "   1. 按 Ctrl+Shift+P → 输入 'Reload Window' → 回车"
    echo "   2. 完全重启 $IDE_NAME"
    echo ""
else
    echo ""
    echo "⚠️  自动安装失败（这在 SSH 环境中很常见）"
    echo "✅ 插件已成功打包！"
    echo "📋 打包文件: $VSIX_FILE"
    echo ""
    echo "📦 请手动安装插件："
    echo "   1. 在 $IDE_NAME 中按 Ctrl+Shift+X 打开扩展面板"
    echo "   2. 点击右上角 ··· 菜单"
    echo "   3. 选择 '从 VSIX 安装...'"
    echo "   4. 选择文件: $(pwd)/$VSIX_FILE"
    echo ""
    echo "   或者在 $IDE_NAME 的终端中运行："
    echo "   $CMD --install-extension $(pwd)/$VSIX_FILE --force"
    echo ""
fi
