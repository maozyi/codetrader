#!/bin/bash

# CodeTrader 开发模式脚本
# 用途：监听文件变化，自动重新编译并安装

echo "🔧 CodeTrader 开发模式"
echo "监听文件变化，自动重新编译..."
echo "按 Ctrl+C 退出"
echo ""

# 进入项目目录
cd "$(dirname "$0")/.."

# 初始编译一次
bash scripts/rebuild.sh

# 监听文件变化（需要安装 inotify-tools）
if command -v inotifywait &> /dev/null; then
    echo "📡 开始监听文件变化..."
    while inotifywait -r -e modify,create,delete src/; do
        echo ""
        echo "🔄 检测到文件变化，重新编译..."
        bash scripts/rebuild.sh
    done
else
    echo "⚠️  未安装 inotify-tools，无法监听文件变化"
    echo "   安装命令: sudo apt-get install inotify-tools"
fi
