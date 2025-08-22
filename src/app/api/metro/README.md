# 地铁数据API使用说明

## 概述
这个API用于保护地铁数据，避免数据直接从浏览器控制台的Network面板中暴露。

## API端点
- **GET** `/api/metro?type=lines` - 获取地铁线路数据
- **GET** `/api/metro?type=schedule` - 获取地铁时刻表数据  
- **GET** `/api/metro?type=intervals` - 获取地铁发车间隔数据

## 安全特性
1. **来源验证**: 只允许来自允许域名的请求
2. **数据混淆**: 使用Base64编码和字符反转来混淆数据内容
3. **缓存控制**: 设置响应头防止敏感数据被缓存
4. **错误处理**: 统一的错误响应格式
5. **请求限制**: 可配置的请求频率限制
6. **数据完整性验证**: 验证响应数据的结构和完整性

## 使用方法
```typescript
// 使用客户端数据处理工具（推荐）
import { fetchMetroData } from './dataClient';

// 获取线路数据
const linesData = await fetchMetroData('lines');

// 获取时刻表数据
const scheduleData = await fetchMetroData('schedule');

// 获取发车间隔数据
const intervalsData = await fetchMetroData('intervals');
```

**注意**: 直接使用fetch会返回混淆的数据，需要使用`fetchMetroData`函数来自动解混淆。

## 配置
在 `config.ts` 文件中可以配置：
- 允许的请求来源域名
- 请求频率限制
- 数据文件路径

## 注意事项
- 所有数据请求现在通过API路由进行，不再直接访问public文件夹
- 确保在生产环境中配置正确的允许域名
- 可以根据需要添加更多的安全措施（如API密钥、用户认证等）
