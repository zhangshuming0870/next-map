// 数据加密和混淆工具

// 简单的数据混淆函数
export function obfuscateData(data: any): string {
    const jsonString = JSON.stringify(data);
    
    // 使用简单的Base64编码和字符替换来混淆数据
    const encoded = Buffer.from(jsonString, 'utf-8').toString('base64');
    
    // 进一步混淆：添加随机字符和反转部分内容
    const reversed = encoded.split('').reverse().join('');
    const timestamp = Date.now().toString(36);
    
    return `${timestamp}_${reversed}_${Math.random().toString(36).substring(2)}`;
}

// 数据解混淆函数
export function deobfuscateData(obfuscatedData: string): any {
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

// 数据分块传输
export function chunkData(data: any, chunkSize: number = 1000): string[] {
    const jsonString = JSON.stringify(data);
    const chunks: string[] = [];
    
    for (let i = 0; i < jsonString.length; i += chunkSize) {
        const chunk = jsonString.slice(i, i + chunkSize);
        chunks.push(obfuscateData({ chunk, index: i, total: jsonString.length }));
    }
    
    return chunks;
}

// 验证数据完整性
export function validateDataIntegrity(data: any): boolean {
    try {
        if (typeof data !== 'object' || data === null) {
            return false;
        }
        
        // 检查必要的数据结构
        if (data.lines && Array.isArray(data.lines)) {
            return true;
        }
        
        if (Array.isArray(data)) {
            return true;
        }
        
        return false;
    } catch {
        return false;
    }
}
