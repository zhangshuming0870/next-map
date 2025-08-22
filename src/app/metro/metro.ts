import { MetroLineData, MetroStationData } from './types';
import StationLayer from './StationLayer';
import { PathLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { fetchMetroData, validateResponseData } from './dataClient';



export default class Metro {
    private layers: any[] = [];
    private lineData: MetroLineData[] = [];
    private stations: Map<string, any> = new Map();
    private schedule: any[] = [];
    private stationTimeInterval: any[] = [];
    lineUpdateTimes: any[] = [];
    // 所有线路的动画度量集合
    private allLineAnimMetrics: Array<{
        id: string;
        lineNo: string;
        description: string;
        lineColor: string;
        pathCoords: [number, number][];
        stationNames: string[];
        timetableIndices: number[];
        segmentDurationsMs: number[]; // 原始段总时长（用于总时长计算，等于 move + dwell）
        segmentMoveDurationsMs: number[]; // 移动时长
        segmentDwellDurationsMs: number[]; // 停站时长（默认 30s，且从原始段时长中扣除）
        totalDurationMs: number;
    }> = [];
    // 车辆外观（单位：米）
    private vehicleLengthMeters: number = 250; // 适度缩小，便于辨识
    private vehicleWidthMeters: number = 120;
    private vehicleElevationMeters: number = 120; // 挤出高度（降低）
    // 存储整理后的发车间隔数据，用于界面展示
    private lineIntervals: Array<{
        lineNo: number;
        intervals: any;
        dayOfWeek: number;
    }> = [];
    
    // 标签显示层级配置
    private labelDisplayConfig = {
        stationLabels: {
            minZoom: 10,  // 站点标签显示的最小缩放级别
            enabled: true
        },
        vehicleLabels: {
            minZoom: 11,  // 列车标签显示的最小缩放级别
            enabled: true
        }
    };
    constructor() {
        this.init();
    }

    async init(): Promise<void> {
        try {
            const data = await this.getData();
            this.processData(data);
            this.createLayers();

            await this.initScheduleData();

            await this.getStationTimeInterval();
            this.initStationTimeInterval();

            this.buildAnimate();
            //TODO 这里添加一个处理，让meterControl知道数据处理完了
        } catch (error) {
            console.error('Failed to initialize metro:', error);
        }
    }

    private buildAnimate() {
        if (Array.isArray(this.lineIntervals)) {
            for (const li of this.lineIntervals) {
                const lineNo = Number(li?.lineNo);
                if (!Number.isFinite(lineNo)) continue;
                const other = li?.intervals?.other;

                if (Array.isArray(other) && other.length > 0) {
                    this.applySegmentsToSchedule(lineNo, other);
                }
            }
        }

        // 重建动画度量
        this.buildAllLineMetrics();
    }

    // 动态应用：按 timeKey（如 "07:30-10:00" 或 "other"）为某条线路设置区间速度
    public applyLineTimeKey(lineNo: number, timeKey: string): void {
        const rec = this.lineIntervals.find((l: any) => l.lineNo == lineNo);
        const segments = rec?.intervals?.[timeKey];
        if (!segments) return;
        if (Array.isArray(segments)) {
            this.applySegmentsToSchedule(lineNo, segments);
        } else if (typeof segments === 'string') {
            this.applySegmentsToSchedule(lineNo, [{ station_range: '', time: segments }]);
        }
        this.buildAllLineMetrics();
    }

    // 基础能力：把一个线路的若干 station_range 段落的分钟数写入到该线路所有方向的时刻表段
    private applySegmentsToSchedule(lineNo: number, segments: Array<{ station_range: any, time: any }>): void {
        // - time: 'MM:SS' 或 数字（分钟）
        // - 若 station_range 缺失或无效，则应用于整条线路（全段）
        if (!Array.isArray(segments) || segments.length === 0) {
            return;
        }

        const isRingLine = Number(lineNo) === 4; // 4 号线为环线，特殊处理跨尾首的区间

        // 将单个分段应用到某条时刻表（一个方向/description）上
        const applyOneSegmentToTimetables = (timetables: any[], startIdx: number, endIdx: number, minutes: number) => {
            if (!Array.isArray(timetables) || timetables.length < 2) return;
            // 规范边界
            const n = timetables.length;
            const s = Math.max(0, Math.min(startIdx, n - 1));
            const e = Math.max(0, Math.min(endIdx, n - 1));
            if (s === e) return;
            // 非环线：只处理 s < e 的常规区间
            if (!isRingLine) {
                const from = Math.min(s, e);
                const to = Math.max(s, e);
                for (let i = from; i < to; i++) {
                    const seg = timetables[i];
                    if (!seg) continue;
                    seg.timeInterval = { minutes };
                }
                return;
            }
            // 环线：允许跨尾首，例如 s > e 代表从 s..n-1 再到 0..e-1
            if (s < e) {
                for (let i = s; i < e; i++) {
                    const seg = timetables[i];
                    if (!seg) continue;
                    seg.timeInterval = { minutes };
                }
            } else {
                for (let i = s; i < n - 0; i++) {
                    if (i >= n - 1) break;
                    const seg = timetables[i];
                    if (!seg) continue;
                    seg.timeInterval = { minutes };
                }
                for (let i = 0; i < e; i++) {
                    const seg = timetables[i];
                    if (!seg) continue;
                    seg.timeInterval = { minutes };
                }
            }
        };

        // 逐段应用
        for (const segment of segments) {
            const minutes = this.parseMmSsToMinutes(segment?.time);
            if (!(typeof minutes === 'number' && minutes > 0)) continue;

            const range = segment?.station_range;
            const hasValidRange = Array.isArray(range) && range.length === 2 && range[0] && range[1];

            // 遍历该线路的所有方向/描述
            for (const line of this.schedule) {
                if (Number(line?.lineNo) !== Number(lineNo)) continue;
                const timetables = Array.isArray(line?.timetables) ? line.timetables : [];
                if (timetables.length < 2) continue;

                if (!hasValidRange) {
                    // 无有效区间：整线应用
                    applyOneSegmentToTimetables(timetables, 0, timetables.length - 1, minutes);
                    continue;
                }

                const startName = String(range[0]);
                const endName = String(range[1]);
                let startIdx = timetables.findIndex((t: any) => t?.name === startName);
                let endIdx = timetables.findIndex((t: any) => t?.name === endName);

                // 缺失容错
                if (startIdx < 0 && endIdx < 0) {
                    // 全部
                    applyOneSegmentToTimetables(timetables, 0, timetables.length - 1, minutes);
                    continue;
                }
                if (startIdx < 0) startIdx = 0;
                if (endIdx < 0) endIdx = timetables.length - 1;

                // 环线下优先使用更靠后的终点索引以覆盖跨尾首区间（若存在多个同名站点）
                if (isRingLine && endIdx <= startIdx) {
                    const lastIdx = (() => {
                        for (let i = timetables.length - 1; i >= 0; i--) {
                            if (timetables[i]?.name === endName) return i;
                        }
                        return endIdx;
                    })();
                    endIdx = lastIdx;
                }

                applyOneSegmentToTimetables(timetables, startIdx, endIdx, minutes);
            }
        }
    }

    // 将 "MM:SS" 或数字字符串转为分钟数
    private parseMmSsToMinutes(value: any): number {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return 0;
        const text = value.trim();
        const mmSsMatch = text.match(/^(\d{1,2}):(\d{2})$/);
        if (mmSsMatch) {
            const mm = Number(mmSsMatch[1]);
            const ss = Number(mmSsMatch[2]);
            if (Number.isFinite(mm) && Number.isFinite(ss)) return mm + ss / 60;
        }
        const numeric = Number(text);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    private async getStationTimeInterval(): Promise<void> {
        try {
            console.log('开始获取发车间隔数据...');
            const data = await fetchMetroData('intervals');
            console.log('获取到的发车间隔数据:', data);

            if (!data || !Array.isArray(data)) {
                console.error('发车间隔数据格式错误:', data);
                return;
            }

            //先找出所有线路中最长的线路
            let newSchedule: { [key: string]: any } = {};
            this.schedule.forEach((line: any) => {
                if (!newSchedule[line.lineNo]) {
                    newSchedule[line.lineNo] = line;
                }
                if (line.timetables.length > newSchedule[line.lineNo].timetables.length && line.direction == 1) {
                    newSchedule[line.lineNo] = line;
                }
            })
            
            console.log('处理后的时刻表数据:', newSchedule);
            
            data.forEach((d: any) => {
                Object.values(newSchedule).forEach((ld: any) => {
                    if (d.line === ld.lineNo) {
                        d.interval.forEach((di: any) => {
                            for (let interval in di.range_interval) {
                                //补齐时间为字符串的数据
                                if (typeof di.range_interval[interval] == 'string') {
                                    let time = di.range_interval[interval];
                                    di.range_interval[interval] = [{
                                        station_range: [ld.timetables[0].name, ld.timetables[ld.timetables.length - 1].name],
                                        time
                                    }]
                                }

                                //补齐只有"过去"没有"回来"的数据
                                di.range_interval[interval].forEach((range_time: any) => {
                                    let range = range_time.station_range;
                                    let reverseRange = di.range_interval[interval].find((ri: any) => {
                                        let range1 = ri.station_range;
                                        return range1[0] === range[1] && range1[1] === range[0];
                                    })
                                    if (!reverseRange) {
                                        di.range_interval[interval].push({
                                            station_range: [range[1], range[0]],
                                            time: range_time.time
                                        })
                                    }
                                })
                                if (di.range.indexOf(new Date().getDay()) > 0) {
                                    this.lineUpdateTimes.push({
                                        line: d.line,
                                        time: interval,
                                    })
                                }

                            }
                        })
                    }
                })
            })
            
            this.stationTimeInterval = data;
            console.log('发车间隔数据处理完成，数据量:', this.stationTimeInterval.length);
        } catch (error) {
            console.error('获取发车间隔数据失败:', error);
            // 设置默认数据，避免界面显示异常
            this.stationTimeInterval = [];
        }
    }

    animateSpeedReload(lineTime: any): void {
        let lineInterval = this.lineIntervals.find((l: any) => l.lineNo == lineTime.line);
        let interval = lineInterval?.intervals[lineTime.time];
        this.applySegmentsToSchedule(lineTime.line, interval);
        this.buildAllLineMetrics();
    }

    private initStationTimeInterval(): void {
        try {
            console.log('开始初始化发车间隔数据...');
            console.log('当前stationTimeInterval数据:', this.stationTimeInterval);

            if (!this.stationTimeInterval || !Array.isArray(this.stationTimeInterval)) {
                console.warn('发车间隔数据为空，无法初始化');
                this.lineIntervals = [];
                return;
            }

            const today = new Date().getDay();
            const dayOfWeek = today === 0 ? 7 : today;
            console.log('今天是周几:', dayOfWeek);

            // 清空之前的数据
            this.lineIntervals = [];

            // 处理每条地铁线的发车间隔数据
            this.stationTimeInterval.forEach((lineData: any) => {
                const lineNo = lineData.line;
                const intervals = lineData.interval;
                console.log(`处理线路${lineNo}的发车间隔数据:`, intervals);

                // 找到匹配今天周几的interval配置
                const todayInterval = intervals.find((interval: any) =>
                    interval.range.includes(dayOfWeek)
                );

                if (todayInterval) {
                    console.log(`线路${lineNo}找到周${dayOfWeek}的配置:`, todayInterval);
                    // 存储整理后的数据用于界面展示
                    this.lineIntervals.push({
                        lineNo: lineNo,
                        intervals: todayInterval.range_interval,
                        dayOfWeek: dayOfWeek
                    });
                } else {
                    console.warn(`线路${lineNo}没有找到周${dayOfWeek}的发车间隔配置`);
                }
            });

            console.log('初始化完成，lineIntervals数据量:', this.lineIntervals.length);
            console.log('lineIntervals数据:', this.lineIntervals);
        } catch (error) {
            console.error('初始化发车间隔数据失败:', error);
            this.lineIntervals = [];
        }
    }

    private processData(data: any[]): void {
        this.lineData = data.map((line: any) => ({
            name: line.line_info.line_no,
            color: line.line_info.color,
            stations: line.stations
                .filter((station: any) =>
                    station.longitude && station.latitude &&
                    station.longitude !== 0 && station.latitude !== 0
                )
                .map((station: any) => {
                    this.stations.set(station.stat_id, station);
                    return {
                        longitude: station.longitude,
                        latitude: station.latitude,
                        name: station.name_cn
                    } as MetroStationData;
                })
        } as MetroLineData));
    }

    private createLayers(): void {
        // 创建统一的站点图层
        this.layers.push(new StationLayer({
            id: 'unified-stations',
            iconAtlas: '/metro/ditieicon.png',
            getColor: (d: MetroStationData & { lineColor: string }) => this.hexToRgb(d.lineColor),
            linePaths: this.lineData,
            showStationText: true
        }));
    }

    private hexToRgb(hex: string): [number, number, number] {
        const cleanHex = hex.replace('#', '');
        if (cleanHex.length !== 6) {
            return [255, 0, 0]; // 默认红色
        }

        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);

        return [r, g, b];
    }

    // 公共方法：获取所有图层
    public getLayers(): any[] {
        return this.layers;
    }

    // 根据缩放级别返回基础图层（控制站名是否显示）
    public getBaseLayersForZoom(zoom: number): any[] {
        const showStationText = typeof zoom === 'number' ? 
            (zoom >= this.labelDisplayConfig.stationLabels.minZoom && this.labelDisplayConfig.stationLabels.enabled) : 
            this.labelDisplayConfig.stationLabels.enabled;
        return [
            new StationLayer({
                id: 'unified-stations',
                iconAtlas: '/metro/ditieicon.png',
                getColor: (d: MetroStationData & { lineColor: string }) => this.hexToRgb(d.lineColor),
                linePaths: this.lineData,
                showStationText
            })
        ];
    }

    // 公共方法：获取发车间隔数据
    public getLineIntervals(): Array<{
        lineNo: number;
        intervals: any;
        dayOfWeek: number;
    }> {
        return this.lineIntervals;
    }

    // 公共方法：获取线路颜色映射（lineNo -> lineColor）
    public getLineColorMap(): { [key: number]: string } {
        const colorMap: { [key: number]: string } = {};
        if (Array.isArray(this.schedule)) {
            for (const line of this.schedule) {
                const n = Number(line?.lineNo);
                const color = line?.lineColor;
                if (Number.isFinite(n) && typeof color === 'string' && color) {
                    if (!colorMap[n]) colorMap[n] = color;
                }
            }
        }
        // 若 schedule 未包含颜色，尝试从基础 lineData 中兜底
        if (Object.keys(colorMap).length === 0 && Array.isArray(this.lineData)) {
            for (const ld of this.lineData as any[]) {
                const n = Number(ld?.name);
                const color = ld?.color;
                if (Number.isFinite(n) && typeof color === 'string' && color) {
                    if (!colorMap[n]) colorMap[n] = color;
                }
            }
        }
        return colorMap;
    }

    /**
     * 配置标签显示层级
     * @param config 标签显示配置
     */
    public configureLabelDisplay(config: {
        stationLabels?: {
            minZoom?: number;
            enabled?: boolean;
        };
        vehicleLabels?: {
            minZoom?: number;
            enabled?: boolean;
        };
    }): void {
        if (config.stationLabels) {
            if (typeof config.stationLabels.minZoom === 'number') {
                this.labelDisplayConfig.stationLabels.minZoom = config.stationLabels.minZoom;
            }
            if (typeof config.stationLabels.enabled === 'boolean') {
                this.labelDisplayConfig.stationLabels.enabled = config.stationLabels.enabled;
            }
        }
        
        if (config.vehicleLabels) {
            if (typeof config.vehicleLabels.minZoom === 'number') {
                this.labelDisplayConfig.vehicleLabels.minZoom = config.vehicleLabels.minZoom;
            }
            if (typeof config.vehicleLabels.enabled === 'boolean') {
                this.labelDisplayConfig.vehicleLabels.enabled = config.vehicleLabels.enabled;
            }
        }
        
        console.log('标签显示配置已更新:', this.labelDisplayConfig);
    }

    /**
     * 获取当前标签显示配置
     */
    public getLabelDisplayConfig(): any {
        return { ...this.labelDisplayConfig };
    }


    private async getData(): Promise<any[]> {
        try {
            const data = await fetchMetroData('lines');
            
            if (!validateResponseData(data, 'lines')) {
                throw new Error('Invalid lines data structure');
            }
            
            return data.lines;
        } catch (error) {
            console.error('Failed to fetch metro data:', error);
            throw error;
        }
    }

    private async getScheduleData(): Promise<any> {
        try {
            const data = await fetchMetroData('schedule');
            
            if (!validateResponseData(data, 'schedule')) {
                throw new Error('Invalid schedule data structure');
            }

            return data;
        } catch (error) {
            console.error('Failed to fetch schedule data:', error);
            throw error;
        }
    }

    private async initScheduleData(): Promise<void> {
        try {
            const scheduleData = await this.getScheduleData();

            if (!scheduleData || !scheduleData.lines) {
                console.warn('时刻表数据为空或格式不正确');
                return;
            }

            // 清空现有数据，避免重复
            this.schedule = [];

            // 处理每条地铁线的时刻表
            scheduleData.lines.forEach((lineData: any) => {
                if (!lineData.timetable || !lineData.timetable.timetable) {
                    console.warn(`线路 ${lineData.line_info?.line_no} 的时刻表数据不完整`);
                    return;
                }

                const lineNo = lineData.line_info?.line_no;
                const lineColor = lineData.line_info?.color;
                const timetableData = lineData.timetable.timetable;

                // 按 description 分组时刻表数据
                const groupedTimetables = this.groupTimetablesByDescription(timetableData);

                // 为每个分组创建时刻表对象
                Object.keys(groupedTimetables).forEach(description => {
                    const timetables = groupedTimetables[description];

                    // 根据地铁第一个站点的首站时间和第二个站点的首站时间，计算所提供时间表是正序还是倒叙
                    const firstTime = this.parseTime(timetables[0].first_time);
                    const secondTime = this.parseTime(timetables[1].first_time);
                    const direction = firstTime > secondTime ? -1 : 1;

                    // 创建时刻表对象，按照 JSON 列表形式存储
                    const scheduleLine = {
                        lineNo: lineNo,
                        direction,
                        lineColor: lineColor,
                        description: description,
                        timetables: direction === 1 ? timetables : timetables.reverse(),
                    };

                    // 将时刻表数据存储到 schedule 数组中
                    this.schedule.push(scheduleLine);
                });
            });

            // 从官方时刻表推导相邻站区间运行时间，尽量还原真实每段耗时
            // 为避免异常值，进行合理夹取（0.5 ~ 20 分钟），并仅设置 i..i+1 段的起点 i 的 timeInterval
            for (const line of this.schedule) {
                const timetables = Array.isArray(line?.timetables) ? line.timetables : [];
                if (timetables.length < 2) continue;
                for (let i = 0; i < timetables.length - 1; i++) {
                    const a = timetables[i];
                    const b = timetables[i + 1];
                    const fA = this.parseTime(a?.first_time || '');
                    const fB = this.parseTime(b?.first_time || '');
                    const lA = this.parseTime(a?.last_time || '');
                    const lB = this.parseTime(b?.last_time || '');

                    const deltas: number[] = [];
                    if (Number.isFinite(fA) && Number.isFinite(fB) && (fA > 0 || fB > 0)) {
                        let d = fB - fA; if (d <= 0) d += 24 * 60; deltas.push(d);
                    }
                    if (Number.isFinite(lA) && Number.isFinite(lB) && (lA > 0 || lB > 0)) {
                        let d = lB - lA; if (d <= 0) d += 24 * 60; deltas.push(d);
                    }
                    if (deltas.length === 0) continue;
                    const base = Math.min(...deltas);
                    const minutes = Math.max(0.5, Math.min(base, 20));
                    a.timeInterval = { minutes };
                }
            }


        } catch (error) {
            console.error('获取时刻表数据失败:', error);
        }
    }

    private parseTime(timeStr: string): number {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }


    private groupTimetablesByDescription(timetableData: any[]): { [key: string]: any[] } {
        const grouped: { [key: string]: any[] } = {};

        timetableData.forEach((item: any) => {
            const description = item.description || '未知方向';
            if (!grouped[description]) {
                grouped[description] = [];
            }
            grouped[description].push(item);
        });

        return grouped;
    }


    /**
     * 预计算所有线路（包括不同 description）的动画度量，用于一次性渲染所有线路的动画。
     */
    private buildAllLineMetrics(): void {
        this.allLineAnimMetrics = [];
        for (let li = 0; li < this.schedule.length; li++) {
            const line = this.schedule[li];
            const timetables = line?.timetables;
            if (!timetables || timetables.length < 2) continue;
            const pathCoords: [number, number][] = [];
            const stationNames: string[] = [];
            const timetableIndices: number[] = [];
            // 路径
            for (let i = 0; i < timetables.length; i++) {
                const item = timetables[i];
                const detail = item.detail || this.stations.get(item.stat_id);
                if (detail && detail.longitude && detail.latitude) {
                    pathCoords.push([detail.longitude, detail.latitude]);
                    const name = detail.name_cn || detail.stat_name || item.name_cn || '';
                    stationNames.push(String(name));
                    timetableIndices.push(i);
                }
            }
            if (pathCoords.length < 2) continue;
            // 时长（ms）
            const segmentDurationsMs: number[] = [];
            const segmentMoveDurationsMs: number[] = [];
            const segmentDwellDurationsMs: number[] = [];
            let totalDurationMs = 0;
            for (let i = 0; i < pathCoords.length - 1; i++) {
                const tIndex = timetableIndices[i];
                const station = timetables[tIndex];
                const minutes = station?.timeInterval?.minutes;
                if (!(typeof minutes === 'number' && minutes > 0)) {
                    console.log(station)
                }
                const segmentMinutes = typeof minutes === 'number' && minutes > 0 ? minutes : 1;
                const ms = segmentMinutes * 60 * 1000;
                const dwellMs = Math.min(30000, Math.max(0, ms));
                const moveMs = Math.max(ms - dwellMs, 0);
                segmentDurationsMs.push(ms);
                segmentMoveDurationsMs.push(moveMs);
                segmentDwellDurationsMs.push(dwellMs);
                totalDurationMs += ms;
            }
            this.allLineAnimMetrics.push({
                id: `${line.lineNo}-${line.description}`,
                lineNo: line.lineNo,
                description: line.description,
                lineColor: line.lineColor,
                pathCoords,
                stationNames,
                timetableIndices,
                segmentDurationsMs,
                segmentMoveDurationsMs,
                segmentDwellDurationsMs,
                totalDurationMs
            });
        }
    }


    /**
     * 基于已过时间（毫秒）返回动画图层。不同站段用不同时长推进，匹配真实分钟。
     */
    // 真实时钟驱动：从当天 05:00 开始至 23:00 期间按“首段时长”作为发车间隔循环发车，
    // 到达终点（超出总时长）即移除；进入系统时自动补算应在图上的列车。
    public getAnimatedLayersByClock(nowMs: number, zoom?: number): any[] {
        const serviceStartMs = this.getTodayMsAt(5, 0);
        const serviceEndMs = this.getTodayMsAt(22, 30);
        const layers: any[] = [];
        const vehiclePolygons: Array<{ polygon: [number, number][], color: [number, number, number, number] }> = [];
        const vehicleLabels: Array<{ position: [number, number], text: string, color: [number, number, number, number] }> = [];
        const showVehicleLabels = typeof zoom === 'number' ? 
            (zoom >= this.labelDisplayConfig.vehicleLabels.minZoom && this.labelDisplayConfig.vehicleLabels.enabled) : 
            this.labelDisplayConfig.vehicleLabels.enabled;
        const labelOccupied = new Set<string>();

        for (const metrics of this.allLineAnimMetrics) {
            const totalMs = metrics.totalDurationMs || 0;
            if (totalMs <= 0) continue;

            // 发车间隔采用该方向首段时长
            const headwayMs = metrics.segmentDurationsMs?.[0] ?? 0;
            if (!(headwayMs > 0)) continue;

            // 允许 23:00 后仍显示已发出的列车（直到终点），但不再新增发车
            const lastDepartureCutoff = Math.min(nowMs, serviceEndMs);
            // 若当前时间早于开班，则无需显示
            if (lastDepartureCutoff < serviceStartMs) continue;

            const firstIdx = 0; // 05:00 发首班
            const kStart = firstIdx;
            const kEnd = Math.floor((lastDepartureCutoff - serviceStartMs) / headwayMs);
            if (kEnd < kStart) continue;

            const lineColor = this.hexToRgb((metrics as any).lineColor || '#ffffff');

            for (let k = kStart; k <= kEnd; k++) {
                const departMs = serviceStartMs + k * headwayMs;
                const elapsedMs = nowMs - departMs;
                if (elapsedMs < 0) continue; // 未来的发车
                if (elapsedMs > totalMs) continue; // 已到终点

                const posInfo = this.getPositionAndSegmentOnMetrics(metrics, elapsedMs);
                if (!posInfo) continue;
                const polygon = this.buildVehiclePolygon(
                    posInfo.position,
                    posInfo.from,
                    posInfo.to,
                    this.vehicleLengthMeters,
                    this.vehicleWidthMeters
                );
                vehiclePolygons.push({ polygon, color: [lineColor[0], lineColor[1], lineColor[2], 255] });

                const key = `${Math.round(posInfo.position[0] * 5000)}_${Math.round(posInfo.position[1] * 5000)}`;
                if (!labelOccupied.has(key)) {
                    const nextInfo = this.getNextStationInfo(metrics, posInfo.segmentIndex, posInfo.localMs);
                    // const labelText = nextInfo ? `${nextInfo.nextStation} · 剩余 ${this.formatMinutes(nextInfo.remainingMinutes)}` : (metrics as any).description;
                    const labelText = nextInfo ? `${metrics.stationNames?.[posInfo.segmentIndex]} → ${nextInfo.nextStation}` : (metrics as any).description;
                    vehicleLabels.push({ position: posInfo.position, text: labelText, color: [255, 255, 255, 255] });
                    labelOccupied.add(key);
                }
            }
        }

        if (vehiclePolygons.length > 0) {
            layers.push(new SolidPolygonLayer({
                id: 'schedule-vehicles',
                data: vehiclePolygons,
                getPolygon: (d: any) => d.polygon,
                getFillColor: (d: any) => d.color,
                extruded: true,
                getElevation: () => this.vehicleElevationMeters,
                pickable: false,
                parameters: { depthTest: false }
            }));
        }
        if (vehicleLabels.length > 0) {
            layers.push(new TextLayer({
                id: 'schedule-vehicle-labels',
                data: vehicleLabels,
                visible: showVehicleLabels,
                getPosition: (d: any) => d.position,
                getText: (d: any) => d.text,
                getColor: (d: any) => d.color,
                getSize: 12,
                sizeUnits: 'pixels',
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'bottom',
                background: true,
                getBackgroundColor: [0, 0, 0, 160],
                maxWidth: 220,
                lineHeight: 1.2,
                wordBreak: 'break-word',
                getPixelOffset: [0, 28],
                parameters: { depthTest: false },
                pickable: false,
                characterSet: 'auto'
            }));
        }
        return layers;
    }

    private getTodayMsAt(hour24: number, minute: number): number {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour24, minute, 0, 0);
        return d.getTime();
    }


    // 返回位置与所在段的端点，供构建带朝向的矩形车辆
    private getPositionAndSegmentOnMetrics(metrics: {
        pathCoords: [number, number][],
        stationNames: string[],
        segmentDurationsMs: number[],
        segmentMoveDurationsMs: number[],
        segmentDwellDurationsMs: number[],
        totalDurationMs: number
    }, elapsedMs: number): { position: [number, number], from: [number, number], to: [number, number], segmentIndex: number, localMs: number } | null {
        const path = metrics.pathCoords;
        if (!path || path.length < 2) return null;
        const total = metrics.totalDurationMs;
        if (!total || total <= 0) return { position: path[0], from: path[0], to: path[1], segmentIndex: 0, localMs: 0 };
        const tMs = Math.max(0, Math.min(elapsedMs, total));
        let acc = 0;
        for (let i = 0; i < metrics.segmentDurationsMs.length; i++) {
            const segmentTotal = metrics.segmentDurationsMs[i];
            const moveMs = metrics.segmentMoveDurationsMs[i] ?? segmentTotal;
            const dwellMs = metrics.segmentDwellDurationsMs[i] ?? 0;
            if (tMs <= acc + segmentTotal) {
                const local = tMs - acc;
                const [x1, y1] = path[i];
                const [x2, y2] = path[i + 1];
                if (local <= moveMs && moveMs > 0) {
                    const localT = local / moveMs;
                    const position: [number, number] = [x1 + (x2 - x1) * localT, y1 + (y2 - y1) * localT];
                    return { position, from: [x1, y1], to: [x2, y2], segmentIndex: i, localMs: local };
                } else {
                    // 到站停留阶段：停在下一站
                    const position: [number, number] = [x2, y2];
                    return { position, from: [x1, y1], to: [x2, y2], segmentIndex: i, localMs: local };
                }
            }
            acc += segmentTotal;
        }
        const last = path.length - 1;
        return { position: path[last], from: path[last - 1], to: path[last], segmentIndex: metrics.segmentDurationsMs.length - 1, localMs: 0 };
    }

    // 构建带朝向的长方形车辆多边形（返回经纬度四点环）
    private buildVehiclePolygon(centerLngLat: [number, number], fromLngLat: [number, number], toLngLatParam: [number, number], lengthMeters: number, widthMeters: number): [number, number][] {
        const [clon, clat] = centerLngLat;
        // 本地尺度：每度对应的米数
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(clat * Math.PI / 180);
        const toLocalXY = (lngLat: [number, number]): [number, number] => {
            const [lng, lat] = lngLat;
            return [(lng - clon) * metersPerDegLon, (lat - clat) * metersPerDegLat];
        };
        const fromLocalXYToLngLat = (xy: [number, number]): [number, number] => {
            const [x, y] = xy;
            return [clon + x / metersPerDegLon, clat + y / metersPerDegLat];
        };
        const pFrom = toLocalXY(fromLngLat);
        const pTo = toLocalXY(toLngLatParam);
        let dx = pTo[0] - pFrom[0];
        let dy = pTo[1] - pFrom[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) {
            dx = 1; dy = 0;
        } else {
            dx /= len; dy /= len;
        }
        const nx = -dy;
        const ny = dx;
        const hl = lengthMeters / 2;
        const hw = widthMeters / 2;
        const cx = 0, cy = 0; // center at origin in local coords
        const p1: [number, number] = [cx + dx * hl + nx * hw, cy + dy * hl + ny * hw];
        const p2: [number, number] = [cx + dx * hl - nx * hw, cy + dy * hl - ny * hw];
        const p3: [number, number] = [cx - dx * hl - nx * hw, cy - dy * hl - ny * hw];
        const p4: [number, number] = [cx - dx * hl + nx * hw, cy - dy * hl + ny * hw];
        return [fromLocalXYToLngLat(p1), fromLocalXYToLngLat(p2), fromLocalXYToLngLat(p3), fromLocalXYToLngLat(p4)];
    }

    // 计算下一站名和到达下一站的剩余总时间（移动剩余 + 到站停留）
    private getNextStationInfo(metrics: {
        stationNames: string[],
        segmentDurationsMs: number[],
        segmentMoveDurationsMs: number[],
        segmentDwellDurationsMs: number[],
        totalDurationMs: number
    }, segmentIndex: number, localMs: number): { nextStation: string, remainingMinutes: number, totalMinutes: number } | null {
        const names = metrics.stationNames || [];
        const nextIdx = segmentIndex + 1;
        if (!names[nextIdx]) return null;

        const moveMs = metrics.segmentMoveDurationsMs[segmentIndex] ?? metrics.segmentDurationsMs[segmentIndex] ?? 0;
        const dwellMs = metrics.segmentDwellDurationsMs[segmentIndex] ?? 0;
        const remainingMove = Math.max(moveMs - Math.min(localMs, moveMs), 0);
        const remaining = remainingMove + dwellMs;
        const remainingMinutes = remaining / 60000;
        const totalMinutes = (moveMs + dwellMs) / 60000;
        return { nextStation: names[nextIdx], remainingMinutes, totalMinutes };
    }

    private formatMinutes(mins: number): string {
        if (!Number.isFinite(mins)) return '';
        const totalSeconds = Math.max(0, Math.round(mins * 60));
        const mm = Math.floor(totalSeconds / 60);
        const ss = totalSeconds % 60;
        const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        return `${pad(mm)}:${pad(ss)}`;
    }
}