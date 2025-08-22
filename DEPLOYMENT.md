# 🚇 上海地铁模拟系统 - 部署指南

## 📋 构建状态

✅ **构建成功完成！**

### 📊 构建统计
- **主页面** (`/`): 99.7 kB
- **地铁页面** (`/metro`): 319 kB  
- **测试页面** (`/test`): 292 kB
- **API路由** (`/api/metro`): 99.7 kB

## 🚀 快速部署

### 方法一：使用部署脚本（推荐）
```bash
./deploy.sh
```

### 方法二：手动部署
```bash
# 1. 清理缓存
rm -rf .next

# 2. 构建生产版本
npm run build

# 3. 启动生产服务器
npm run start
```

## 🌐 访问地址

- **本地访问**: http://localhost:3000
- **地铁模拟**: http://localhost:3000/metro
- **测试页面**: http://localhost:3000/test

## 🔧 生产环境配置

### 环境变量
创建 `.env.production` 文件：
```env
NODE_ENV=production
METRO_API_ENABLED=true
```

### 服务器要求
- **Node.js**: 18.x 或更高版本
- **内存**: 至少 512MB
- **存储**: 至少 100MB 可用空间

## 📁 构建文件结构

```
.next/
├── static/          # 静态资源
│   ├── chunks/      # JavaScript 代码块
│   ├── css/         # 样式文件
│   └── media/       # 媒体文件
├── server/          # 服务端代码
└── build-manifest.json  # 构建清单
```

## 🔒 安全特性

### 数据保护
- ✅ API数据混淆
- ✅ 请求来源验证
- ✅ 缓存控制

### 代码保护
- ✅ 源码映射禁用
- ✅ 代码压缩和混淆
- ✅ 安全响应头

## 🛠️ 故障排除

### 常见问题

1. **权限错误**
   ```bash
   sudo rm -rf .next
   npm run build
   ```

2. **端口占用**
   ```bash
   # 查找占用端口的进程
   lsof -i :3000
   # 杀死进程
   kill -9 <PID>
   ```

3. **内存不足**
   ```bash
   # 增加Node.js内存限制
   NODE_OPTIONS="--max-old-space-size=4096" npm run build
   ```

### 性能优化

1. **启用压缩**
   ```bash
   # 在next.config.ts中设置
   compress: true
   ```

2. **代码分割**
   - 已自动启用
   - 按路由分割代码

3. **静态优化**
   - 自动生成静态页面
   - 图片优化

## 📞 技术支持

如果遇到问题，请检查：
1. Node.js版本是否符合要求
2. 依赖包是否正确安装
3. 端口3000是否被占用
4. 系统内存是否充足

## 🎯 下一步

部署完成后，您可以：
1. 配置域名和HTTPS
2. 设置反向代理（如Nginx）
3. 配置CDN加速
4. 设置监控和日志
