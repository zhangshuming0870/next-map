import { MetroLineData, MetroStationData } from './types';
import { PathLayer } from '@deck.gl/layers';
import StationLayer from './StationLayer';



export default class Metro {
    private layers: any[] = [];
    private lineData: MetroLineData[] = [];
    private stations: Map<string, any> = new Map();
    private schedule: any[] = [];

    constructor() {
        this.init();
    }

    async init(): Promise<void> {
        try {
            const data = await this.getData();
            this.processData(data);
            await this.initScheduleData();
            this.createLayers();
        } catch (error) {
            console.error('Failed to initialize metro:', error);
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
                    this.stations.set(station.station_code, station);
                    return {
                        longitude: station.longitude,
                        latitude: station.latitude,
                        name: station.name_cn
                    } as MetroStationData;
                })
        } as MetroLineData));
    }

    private createLayers(): void {
        // 图标映射配置
        const iconMapping = {
            'metro': { x: 0, y: 0, width: 21, height: 30, mask: false }
        };

        // 创建路径图层和收集站点数据
        const allStations: Array<MetroStationData & { lineColor: string }> = [];
        
        this.lineData.forEach((line: MetroLineData) => {
            // 创建路径图层
            this.layers.push(new PathLayer({
                id: `path-${line.name}`,
                data: [line.stations],
                getColor: () => this.hexToRgb(line.color),
                getPath: (d: MetroStationData[]) => d.map(station => [station.longitude, station.latitude]) as [number, number][],
                getWidth: () => 80,
                pickable: true
            }));

            // 收集站点数据
            line.stations.forEach((station: MetroStationData) => {
                allStations.push({ ...station, lineColor: line.color });
            });
        });

        // 创建统一的站点图层
        this.layers.push(new StationLayer({
            id: 'unified-stations',
            data: allStations,
            iconAtlas: '/metro/ditieicon.png',
            iconMapping,
            getColor: (d: MetroStationData & { lineColor: string }) => this.hexToRgb(d.lineColor)
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

    // 公共方法：获取线路数据
    public getLineData(): MetroLineData[] {
        return this.lineData;
    }

    // 公共方法：获取站点数据
    public getStations(): Map<string, any> {
        return this.stations;
    }

    // 公共方法：获取时刻表数据
    public getSchedule(): any[] {
        return this.schedule;
    }

    private async getData(): Promise<any[]> {
        try {
            const response = await fetch('/metro/shanghai_metro.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.lines;
        } catch (error) {
            console.error('Failed to fetch metro data:', error);
            throw error;
        }
    }

    private async getScheduleData(): Promise<any> {
        try {
            const response = await fetch('/metro/shanghai_metro_schedule.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // 验证数据结构
            if (!data || !Array.isArray(data.lines)) {
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

            this.calculateStationIntervals();
            console.log(this.schedule);
        } catch (error) {
            console.error('获取时刻表数据失败:', error);
        }
    }

    private calculateStationIntervals(): void {
        this.schedule.forEach((line: any) => {
            const timetable = line.timetables;
            if (!timetable || timetable.length < 2) {
                return;
            }

            // 遍历时刻表，计算相邻站点间的时间间隔
            for (let i = 0; i < timetable.length; i++) {
                const currentStation = timetable[i];
                const nextStation = timetable[i + 1];

                currentStation.detail = this.stations.get(currentStation.station_code);
                if (nextStation) {
                    // 计算当前站到下一站的时间间隔
                    const currentTime = this.parseTime(currentStation.first_time);
                    const nextTime = this.parseTime(nextStation.first_time);

                    // 计算时间间隔（不考虑跨天等特殊情况）
                    let timeInterval: number = nextTime - currentTime;

                    if (timeInterval < 0) {
                        // 从同线路别的地铁线，找时间间隔补上
                        const nowLine = this.schedule.filter((line: any) => 
                            line.lineNo === currentStation.line && line.description !== currentStation.description
                        );
                        const findLine = nowLine.find(l => {
                            const codes = l.timetables.map((ls: any) => ls.station_code);
                            return codes.includes(currentStation.station_code) && codes.includes(nextStation.station_code);
                        });
                        
                        if (findLine) {
                            const findCurrentStation = findLine.timetables.find((ls: any) => ls.station_code === currentStation.station_code);
                            const findNextStation = findLine.timetables.find((ls: any) => ls.station_code === nextStation.station_code);
                            timeInterval = this.parseTime(findCurrentStation.first_time) - this.parseTime(findNextStation.first_time);
                        }
                    }

                    currentStation.nextStation = nextStation;
                    currentStation.timeInterval = {
                        minutes: timeInterval,
                        formatted: this.formatTimeInterval(timeInterval)
                    };
                } else {
                    // 最后一站，没有下一站
                    currentStation.nextStation = null;
                    currentStation.timeInterval = null;
                }
            }
        });
    }

    private parseTime(timeStr: string): number {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    private formatTimeInterval(minutes: number): string {
        if (minutes < 60) {
            return `${minutes}分钟`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            if (remainingMinutes === 0) {
                return `${hours}小时`;
            } else {
                return `${hours}小时${remainingMinutes}分钟`;
            }
        }
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
}