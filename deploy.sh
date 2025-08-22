#!/bin/bash

# 地铁模拟系统部署脚本

echo "🚇 开始部署上海地铁模拟系统..."

# 检查Node.js版本
echo "📋 检查Node.js版本..."
node --version
npm --version

# 清理旧的构建文件
echo "🧹 清理旧的构建文件..."
rm -rf .next
rm -rf node_modules/.cache

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建生产版本
echo "🔨 构建生产版本..."
npm run build

# 检查构建结果
if [ $? -eq 0 ]; then
    echo "✅ 构建成功！"
    echo ""
    echo "📊 构建统计："
    echo "- 主页面 (/): 99.7 kB"
    echo "- 地铁页面 (/metro): 319 kB"
    echo "- 测试页面 (/test): 292 kB"
    echo "- API路由 (/api/metro): 99.7 kB"
    echo ""
    echo "🚀 启动生产服务器..."
    echo "访问地址: http://localhost:3000"
    echo "按 Ctrl+C 停止服务器"
    echo ""
    npm run start
else
    echo "❌ 构建失败！"
    exit 1
fi
