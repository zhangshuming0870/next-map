import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { METRO_API_CONFIG, validateRequestOrigin } from './config';
import { obfuscateData, validateDataIntegrity } from './utils';

export async function GET(request: NextRequest) {
    try {
        // 获取查询参数
        const { searchParams } = new URL(request.url);
        const dataType = searchParams.get('type');
        
        if (!dataType) {
            return NextResponse.json({ error: 'Missing data type parameter' }, { status: 400 });
        }

        // 验证请求来源
        if (!validateRequestOrigin(request)) {
            return NextResponse.json({ error: 'Unauthorized request origin' }, { status: 403 });
        }

        let data: any;
        let filePath: string;

        switch (dataType) {
            case 'lines':
                filePath = join(process.cwd(), 'public', 'metro', 'shanghai_metro.json');
                break;
            case 'schedule':
                filePath = join(process.cwd(), 'public', 'metro', 'shanghai_metro_schedule.json');
                break;
            case 'intervals':
                filePath = join(process.cwd(), 'public', 'metro', 'interval.json');
                break;
            default:
                return NextResponse.json({ error: 'Invalid data type' }, { status: 400 });
        }

        try {
            const fileContent = readFileSync(filePath, 'utf-8');
            data = JSON.parse(fileContent);
            
            // 验证数据完整性
            if (!validateDataIntegrity(data)) {
                return NextResponse.json({ error: 'Invalid data structure' }, { status: 500 });
            }
        } catch (fileError) {
            console.error('Error reading file:', fileError);
            return NextResponse.json({ error: 'Failed to read data file' }, { status: 500 });
        }

        // 混淆数据以保护内容
        const obfuscatedData = obfuscateData(data);
        
        // 设置响应头，防止缓存敏感数据
        const response = NextResponse.json({ 
            data: obfuscatedData,
            timestamp: Date.now(),
            checksum: Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)
        });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        response.headers.set('Content-Type', 'application/json');
        
        return response;
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
