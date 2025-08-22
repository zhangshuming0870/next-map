import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // 测试基本功能
        const testData = {
            message: 'API测试成功',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'unknown',
            status: 'ok'
        };
        
        return NextResponse.json(testData);
    } catch (error) {
        return NextResponse.json({ 
            error: 'API测试失败', 
            message: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}
