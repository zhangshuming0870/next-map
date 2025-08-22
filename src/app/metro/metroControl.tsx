"use client";

import React, { useEffect } from "react";
import { DeckGL } from '@deck.gl/react';
import Map from 'react-map-gl';
import { MetroViewState } from './types';
import Metro from "./metro";

function useLineNameFormatter() {
    return React.useMemo(() => {
        const specialMap: Record<number, string> = {
            41: '浦江线',
            51: '市域机场线',
        };
        return (line: number | string): string => {
            const n = typeof line === 'number' ? line : parseInt(String(line), 10);
            if (Number.isFinite(n)) {
                if (specialMap[n as number]) return specialMap[n as number];
                if (n >= 1 && n <= 18) return `地铁${n}号线`;
            }
            return `线路 ${line}`;
        };
    }, []);
}

function useTimeLabelFormatter(lineIntervals: any[]) {
    return React.useMemo(() => {
        const findLineIntervals = (line: number) => {
            return lineIntervals.find((li: any) => Number(li?.lineNo) === Number(line));
        };

        const labelMap = ['早高峰', '平峰', '晚高峰'];

        return (line: number | string, timeKey: string): string => {
            if (timeKey === 'other') return '普通时段';
            const li = findLineIntervals(Number(line));
            const intervalsObj = li?.intervals;
            if (intervalsObj && typeof intervalsObj === 'object') {
                const keys = Object.keys(intervalsObj);
                if (keys.includes('other') && keys.length >= 4) {
                    const nonOther = keys.filter(k => k !== 'other');
                    const idx = nonOther.indexOf(timeKey);
                    if (idx >= 0 && idx < labelMap.length) return labelMap[idx];
                }
            }
            return timeKey;
        };
    }, [lineIntervals]);
}

const initialViewState: MetroViewState = {
    longitude: 121.4737,
    latitude: 31.2304,
    zoom: 11,
    pitch: 45, // 斜视角度，0-90度，45度为45度俯视
    bearing: 30 // 旋转角度，0-360度，30度为向右旋转30度
};

export default function MetroControl() {
    const [metro, setMetro] = React.useState<Metro | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [layers, setLayers] = React.useState<any[]>([]);
    const [lineIntervals, setLineIntervals] = React.useState<any[]>([]);
    const [intervalsLoading, setIntervalsLoading] = React.useState(true);
    // 动画进度（0-1 循环）或时间驱动，rAF 句柄，静态基础图层缓存
    const progressRef = React.useRef<number>(0);
    const startTimeRef = React.useRef<number | null>(null);
    const rafRef = React.useRef<number | null>(null);
    const baseLayersRef = React.useRef<any[]>([]);
    const zoomRef = React.useRef<number>(initialViewState.zoom);
    const lineUpdateTimesRef = React.useRef<{ [key: string]: any }>({});
    const formatLineName = useLineNameFormatter();
    const formatTimeLabel = useTimeLabelFormatter(lineIntervals);
    const lineColorMap = React.useMemo(() => {
        if (!metro) return {} as Record<number, string>;
        try {
            return metro.getLineColorMap() || {};
        } catch {
            return {} as Record<number, string>;
        }
    }, [metro]);

    useEffect(() => {
        const initMap = async () => {
            try {
                const metroInstance = new Metro();
                // 等待数据加载完成
                await new Promise(resolve => {
                    const checkData = () => {
                        if (metroInstance.getLayers().length > 0) {
                            resolve(true);
                        } else {
                            setTimeout(checkData, 100);
                        }
                    };
                    checkData();
                });
                setMetro(metroInstance);
                // 缓存基础静态图层，避免每帧从实例读取并触发不必要的重建
                baseLayersRef.current = metroInstance.getBaseLayersForZoom(zoomRef.current);
                setLayers(baseLayersRef.current);
                // 获取发车间隔数据
                const loadIntervals = () => {
                    setIntervalsLoading(true);
                    console.log('开始获取发车间隔数据...');
                    const intervals = metroInstance.getLineIntervals();
                    console.log('获取到的发车间隔数据:', intervals);
                    setLineIntervals(intervals);
                    setIntervalsLoading(false);
                    
                    if (!intervals || intervals.length === 0) {
                        console.warn('发车间隔数据为空，可能的原因：');
                        console.warn('1. API调用失败');
                        console.warn('2. 数据格式错误');
                        console.warn('3. 网络问题');
                        
                        // 如果数据为空，5秒后重试
                        setTimeout(() => {
                            console.log('重试获取发车间隔数据...');
                            setIntervalsLoading(true);
                            const retryIntervals = metroInstance.getLineIntervals();
                            setLineIntervals(retryIntervals);
                            setIntervalsLoading(false);
                        }, 5000);
                    }
                };
                
                // 延迟1秒后首次加载
                setTimeout(loadIntervals, 1000);

                function reloadLineTime(){
                    const now = new Date();
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();

                    const parseTimeToMinutes = (t: string): number => {
                        if (!t) return NaN;
                        const parts = t.split(':');
                        const h = parseInt(parts[0], 10);
                        const m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                        if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
                        return h * 60 + m;
                    };

                    const isInRange = (rangeKey: string): boolean => {
                        if (!rangeKey || rangeKey === 'other') return false;
                        const [startStr, endStr] = rangeKey.split('-');
                        const start = parseTimeToMinutes(startStr);
                        const end = parseTimeToMinutes(endStr);
                        if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
                        if (start === end) return false;
                        return start < end
                            ? (nowMinutes >= start && nowMinutes < end)
                            : (nowMinutes >= start || nowMinutes < end); // 跨午夜
                    };

                    // 为每条线路选择当前应生效的时间段（无匹配则回退到 other）
                    const chosenByLine: { [line: string]: any } = {};

                    // 优先选择时间范围内的段
                    metroInstance.lineUpdateTimes.forEach((lt: any) => {
                        if (isInRange(lt.time)) {
                            chosenByLine[lt.line] = lt;
                        }
                    });

                    // 若没有匹配，回退到 other（如果存在）
                    metroInstance.lineUpdateTimes.forEach((lt: any) => {
                        if (!chosenByLine[lt.line] && lt.time === 'other') {
                            chosenByLine[lt.line] = lt;
                        }
                    });

                    // 仅当进入了新的时段（与上次不同）才触发重载
                    Object.values(chosenByLine).forEach((lt: any) => {
                        const prev = lineUpdateTimesRef.current[lt.line];
                        if (!prev || prev.time !== lt.time) {
                            lineUpdateTimesRef.current[lt.line] = lt;
                            metroInstance.animateSpeedReload(lt);
                        }
                    });
                }
                setInterval(function () {
                    reloadLineTime();
                }, 10000)
                reloadLineTime();
                setIsLoading(false);

                // 启动动画循环：按真实时钟渲染（05:00-23:00 循环发车，入场自动补算）
                const tick = () => {
                    const nowMs = Date.now();
                    const extra = metroInstance.getAnimatedLayersByClock(nowMs, zoomRef.current);
                    setLayers([...baseLayersRef.current, ...extra]);
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            } catch (error) {
                console.error('Failed to initialize metro:', error);
                setIsLoading(false);
            }
        };
        initMap();
        return () => {
            // 组件卸载时取消动画帧，防止内存泄漏与状态更新报错
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    if (isLoading || !metro) {
        return <div>Loading metro data...</div>;
    }

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            {/* DeckGL 地图 */}
            <DeckGL
                initialViewState={initialViewState}
                controller={true}
                layers={layers}
                onViewStateChange={(e: any) => {
                    const z = e?.viewState?.zoom;
                    if (typeof z === 'number' && Math.abs(z - zoomRef.current) > 0.01) {
                        zoomRef.current = z;
                        if (metro) {
                            baseLayersRef.current = metro.getBaseLayersForZoom(z);
                        }
                    }
                }}
            >
                <Map
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiemhhbmdzaHVtaW5nIiwiYSI6ImNtZTd3bzZoNjA5YmwybHByaGgwM2F2aWEifQ.jhE3aCVxj43jnRC5Zfs9Uw'}
                />
            </DeckGL>

            {/* 线路更新状态面板 - 左上角，仿照Mac终端样式 */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: 'rgba(28, 28, 28, 0.95)',
                color: '#00FF00',
                padding: '20px',
                borderRadius: '8px',
                minWidth: '350px',
                maxHeight: '60vh',
                overflowY: 'auto',
                fontSize: '13px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                border: '1px solid #333',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                zIndex: 1000
            }}>

                {/* 终端内容 */}
                <div style={{ lineHeight: '1.4' }}>
                    {Object.keys(lineUpdateTimesRef.current).length === 0 ? (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>
                            <span style={{ color: '#FF6B6B' }}>→</span> 等待线路更新事件...
                        </div>
                    ) : (
                        <div>
                            {Object.values(lineUpdateTimesRef.current).map((update: any, index: number) => (
                                <div key={`${update.line}-${update.time}-${index}`} style={{
                                    marginBottom: '4px',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(0, 0, 0, 0.3)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ color: (lineColorMap[Number(update.line)] || '#00FF00'), fontWeight: 'bold' }}>
                                        <span style={{ color: (lineColorMap[Number(update.line)] || '#00FF00') }}>●</span> {formatLineName(update.line)}
                                    </span>
                                    <span style={{ color: '#00ff00', fontSize: '11px' }}>
                                        {formatTimeLabel(update.line, update.time)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                </div>
            </div>

            {/* 发车间隔信息面板 - 右上角 */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '15px',
                borderRadius: '8px',
                maxWidth: '400px',
                maxHeight: '80vh',
                overflowY: 'auto',
                fontSize: '12px',
                fontFamily: 'monospace',
                zIndex: 1000
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ margin: '0', fontSize: '14px' }}>
                        今日发车间隔 (周{lineIntervals[0]?.dayOfWeek || '?'})
                    </h3>
                    <button 
                        onClick={() => {
                            if (metro) {
                                setIntervalsLoading(true);
                                const intervals = metro.getLineIntervals();
                                setLineIntervals(intervals);
                                setIntervalsLoading(false);
                                console.log('手动刷新发车间隔数据:', intervals);
                            }
                        }}
                        style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)'}
                        onMouseOut={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        {intervalsLoading ? '⏳ 加载中...' : '刷新'}
                    </button>
                </div>
                {lineIntervals && lineIntervals.length > 0 ? (
                    lineIntervals.map((line, index) => (
                        <div key={index} style={{ marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                            <div style={{ fontWeight: 'bold', color: (lineColorMap[Number(line.lineNo)] || '#4CAF50') }}>
                                {formatLineName(line.lineNo)}
                            </div>
                            <div style={{ marginTop: '5px' }}>
                                {Object.entries(line.intervals).map(([timeRange, interval]) => (
                                    <div key={timeRange} style={{ marginLeft: '10px', marginBottom: '3px' }}>
                                        <span style={{ color: '#FFC107' }}>{timeRange}:</span>
                                        <span style={{ color: '#E0E0E0' }}>
                                            {Array.isArray(interval)
                                                ? interval.map((item: any, idx: number) => (
                                                    <div key={idx} style={{ marginLeft: '15px' }}>
                                                        {item.station_range?.join(' → ')}: {item.time}
                                                    </div>
                                                ))
                                                : String(interval)
                                            }
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ color: '#888', fontStyle: 'italic' }}>
                        {intervalsLoading ? (
                            <>
                                <span style={{ color: '#FF6B6B' }}>→</span> 正在加载发车间隔数据...
                                <br />
                                <span style={{ fontSize: '11px', color: '#666' }}>
                                    请稍候...
                                </span>
                            </>
                        ) : (
                            <>
                                <span style={{ color: '#FF6B6B' }}>→</span> 发车间隔数据加载失败
                                <br />
                                <span style={{ fontSize: '11px', color: '#666' }}>
                                    请点击刷新按钮重试
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* 标签显示控制面板 - 左下角 */}
            <div style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                background: 'rgba(0, 0, 0, 0.9)',
                color: 'white',
                padding: '15px',
                borderRadius: '8px',
                maxWidth: '300px',
                fontSize: '12px',
                fontFamily: 'monospace',
                zIndex: 1000
            }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4CAF50' }}>
                    🏷️ 标签显示控制
                </h3>
                {metro && (() => {
                    const config = metro.getLabelDisplayConfig();
                    return (
                        <div>
                            {/* 站点标签控制 */}
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span>站点标签</span>
                                    <button 
                                        onClick={() => {
                                            metro.configureLabelDisplay({
                                                stationLabels: { enabled: !config.stationLabels.enabled }
                                            });
                                        }}
                                        style={{
                                            background: config.stationLabels.enabled ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 0, 0, 0.3)',
                                            border: '1px solid rgba(255, 255, 255, 0.3)',
                                            color: 'white',
                                            padding: '2px 6px',
                                            borderRadius: '3px',
                                            fontSize: '10px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {config.stationLabels.enabled ? '开启' : '关闭'}
                                    </button>
                                </div>
                                <div style={{ fontSize: '10px', color: '#888' }}>
                                    显示层级: ≥ {config.stationLabels.minZoom}
                                </div>
                            </div>

                            {/* 列车标签控制 */}
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <span>列车标签</span>
                                    <button 
                                        onClick={() => {
                                            metro.configureLabelDisplay({
                                                vehicleLabels: { enabled: !config.vehicleLabels.enabled }
                                            });
                                        }}
                                        style={{
                                            background: config.vehicleLabels.enabled ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 0, 0, 0.3)',
                                            border: '1px solid rgba(255, 255, 255, 0.3)',
                                            color: 'white',
                                            padding: '2px 6px',
                                            borderRadius: '3px',
                                            fontSize: '10px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {config.vehicleLabels.enabled ? '开启' : '关闭'}
                                    </button>
                                </div>
                                <div style={{ fontSize: '10px', color: '#888' }}>
                                    显示层级: ≥ {config.vehicleLabels.minZoom}
                                </div>
                            </div>

                            {/* 快速设置 */}
                            <div style={{ borderTop: '1px solid #333', paddingTop: '8px' }}>
                                <div style={{ fontSize: '10px', color: '#888', marginBottom: '5px' }}>快速设置:</div>
                                <button 
                                    onClick={() => {
                                        metro.configureLabelDisplay({
                                            stationLabels: { minZoom: 8 },
                                            vehicleLabels: { minZoom: 9 }
                                        });
                                    }}
                                    style={{
                                        background: 'rgba(255, 193, 7, 0.3)',
                                        border: '1px solid rgba(255, 193, 7, 0.5)',
                                        color: 'white',
                                        padding: '3px 8px',
                                        borderRadius: '3px',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        marginRight: '5px'
                                    }}
                                >
                                    显示更多
                                </button>
                                <button 
                                    onClick={() => {
                                        metro.configureLabelDisplay({
                                            stationLabels: { minZoom: 12 },
                                            vehicleLabels: { minZoom: 13 }
                                        });
                                    }}
                                    style={{
                                        background: 'rgba(156, 39, 176, 0.3)',
                                        border: '1px solid rgba(156, 39, 176, 0.5)',
                                        color: 'white',
                                        padding: '3px 8px',
                                        borderRadius: '3px',
                                        fontSize: '10px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    显示更少
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
