// 地铁数据API配置和安全设置
export const METRO_API_CONFIG = {
    // 是否启用API
    enabled: process.env.METRO_API_ENABLED !== 'false',
    
    // 允许的请求来源
    allowedOrigins: [
        'http://localhost:3000',
        'https://localhost:3000',
        // 添加您的生产环境域名
    ],
    
    // 请求频率限制
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15分钟
        maxRequests: 100 // 最大请求次数
    },
    
    // 数据文件路径配置
    dataFiles: {
        lines: 'shanghai_metro.json',
        schedule: 'shanghai_metro_schedule.json',
        intervals: 'interval.json'
    }
};

// 验证请求来源
export function validateRequestOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // 如果是同源请求，允许
    if (!origin && !referer) {
        return true;
    }
    
    // 检查是否来自允许的域名
    const allowedOrigins = METRO_API_CONFIG.allowedOrigins;
    return allowedOrigins.some(allowedOrigin => {
        if (origin && origin.includes(allowedOrigin)) return true;
        if (referer && referer.includes(allowedOrigin)) return true;
        return false;
    });
}
