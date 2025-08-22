// 客户端数据处理工具

// 数据解混淆函数（与服务器端对应）
function deobfuscateData(obfuscatedData: string): any {
    try {
        // 移除时间戳和随机字符
        const parts = obfuscatedData.split('_');
        if (parts.length < 2) {
            throw new Error('Invalid obfuscated data format');
        }
        
        const reversed = parts[1];
        const encoded = reversed.split('').reverse().join('');
        const jsonString = Buffer.from(encoded, 'base64').toString('utf-8');
        
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Failed to deobfuscate data:', error);
        throw error;
    }
}

// 安全的API数据获取函数
export async function fetchMetroData(type: 'lines' | 'schedule' | 'intervals'): Promise<any> {
    try {
        const response = await fetch(`/api/metro?type=${type}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // 检查响应结构
        if (!result.data || !result.timestamp || !result.checksum) {
            throw new Error('Invalid API response structure');
        }
        
        // 解混淆数据
        const deobfuscatedData = deobfuscateData(result.data);
        
        return deobfuscatedData;
    } catch (error) {
        console.error(`Failed to fetch ${type} data:`, error);
        throw error;
    }
}

// 验证数据完整性
export function validateResponseData(data: any, type: string): boolean {
    try {
        if (typeof data !== 'object' || data === null) {
            return false;
        }
        
        switch (type) {
            case 'lines':
                return data.lines && Array.isArray(data.lines);
            case 'schedule':
                return data.lines && Array.isArray(data.lines);
            case 'intervals':
                return Array.isArray(data);
            default:
                return false;
        }
    } catch {
        return false;
    }
}
