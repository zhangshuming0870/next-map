import { MetroLineData, MetroStationData } from './types';
import { PathLayer } from '@deck.gl/layers';
import StationLayer from './StationLayer';
import AnimatedTrainLayer from './AnimatedTrainLayer';

export default class Metro {
    layers: any[];
    data: any[];
    lineData: MetroLineData[] = [];
    schedule: any[] = [];
    stations: any[] = [];
    constructor() {
        this.layers = [];
        this.data = [];
        this.init();
    }

    async init() {
        try {
            // 初始化地图数据使用fetch读取public/metro/shanghai_metro.json
            this.data = await this.getData();
            this.schedule = await this.getschedule();
            this.initScheduleData();
            this.initData();
            this.initLayers();
            this.initMetroAnimate()
        } catch (error) {
            console.error('Failed to initialize metro:', error);
        }
    }

    initData() {
        this.lineData = this.data.map((line) => {
            return {
                name: line.line_info.line_no,
                color: line.line_info.color,
                stations: line.stations.filter((station: any) => {
                    return station.longitude && station.latitude &&
                        station.longitude !== 0 && station.latitude !== 0
                }).map((station: any) => {
                    this.stations[station.station_code] = station;
                    return {
                        longitude: station.longitude,
                        latitude: station.latitude,
                        name: station.name_cn
                    } as MetroStationData
                })
            } as MetroLineData
        });
    }

    initLayers() {
        this.initMetroLine();
    }

    initMetroLine() {
        // 图标映射配置
        const iconMapping = {
            'metro': {
                x: 0,
                y: 0,
                width: 21,
                height: 30,
                mask: false
            }
        };

        // 创建路径图层

        // 合并所有站点数据，创建统一的站点图层
        const allStations: Array<MetroStationData & { lineColor: string }> = [];
        this.lineData.forEach((line: MetroLineData) => {
            const layer = new PathLayer({
                id: `path-${line.name}`,
                data: [line.stations], // 将站点数组包装在一个数组中
                getColor: () => this.hexToRgb(line.color),
                getPath: d => d.map((station: MetroStationData) => [station.longitude, station.latitude]),
                getWidth: () => 80,
                pickable: true
            })
            this.layers.push(layer);

            line.stations.forEach((station: MetroStationData) => {
                allStations.push({
                    ...station,
                    lineColor: line.color
                });
            });
        });



        // 创建统一的站点图层
        const unifiedStationLayer = new StationLayer({
            id: 'unified-stations',
            data: allStations,
            iconAtlas: '/metro/ditieicon.png',
            iconMapping: iconMapping,
            getColor: (d: MetroStationData & { lineColor: string }) => this.hexToRgb(d.lineColor)
        });

        this.layers.push(unifiedStationLayer);
    }
    initMetroAnimate() {
        // 使用自定义动画图层，为每条线路创建动画数据
        this.lineData.forEach((line: MetroLineData) => {
            if (line.stations.length === 0) return;

            // 创建路径数据
            const path = line.stations.map(station => [station.longitude, station.latitude]);

            // 创建动画列车数据，包含站点信息
            const trainData = [{
                id: `train-${line.name}`,
                lineName: line.name,
                color: line.color,
                path: path,
                stations: line.stations, // 添加站点信息
                index: 0 // 添加索引用于动画偏移
            }];

            // 创建动画车厢图层
            const trainLayer = new AnimatedTrainLayer({
                id: `train-${line.name}`,
                data: trainData,
                getColor: (d: any) => this.hexToRgb(d.color),
                animationSpeed: 0.00005 // 动画速度
            });

            this.layers.push(trainLayer);
        });
    }

    // 辅助方法：将十六进制颜色转换为RGB数组
    private hexToRgb(hex: string): [number, number, number] {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [255, 0, 0];
    }

    getData(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            fetch('/metro/shanghai_metro.json')
                .then(response => response.json())
                .then(data => {
                    resolve(data.lines);
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    getschedule(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            fetch('/metro/shanghai_metro_schedule.json')
                .then(response => response.json())
                .then(data => {
                    console.log(data);
                    resolve(data);
                })
                .catch(error => {
                    reject(error);
                });
        });
    }
    /**
     * 初始化地铁时刻表数据
     * 
     * 处理逻辑：
     * 1. 读取 public/metro/shanghai_metro_schedule.json 中的 lines 数据结构，每条数据作为一个地铁线 line
     * 2. 每个 line 作为一条地铁线，每条 line 的 timetable 是地铁的时刻表
     * 3. 根据 description 分类，同 description 的作为一条地铁线路
     * 4. 将数据按照 jsonlist 的形式存起来
     */
    initScheduleData() {
        // 获取时刻表数据
        this.getschedule().then((scheduleData: any) => {
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

                    //根据地铁第一个站点的首站时间和第二个站点的首站时间，计算所提供时间表是正序还是倒叙
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

            this.initScheduleLine();
        }).catch(error => {
            console.error('获取时刻表数据失败:', error);
        });
    }
    initScheduleLine() {
        // TODO计算每站到下站所需时间，不考虑特殊情况只管计算
        this.schedule.forEach((line: any) => {
            // 计算站点间时间间隔
            this.calculateStationIntervals(line.timetables);

            // 将计算结果添加到时刻表中

        });
        console.log(this.schedule);
    }

    /**
     * 计算站点间的时间间隔
     * 
     * @param timetable 时刻表数据
     * @returns 包含时间间隔信息的数组
     */
    private calculateStationIntervals(timetable: any) {
        if (!timetable || !timetable.length || timetable.length < 2) {
            return [];
        }


        // 遍历时刻表，计算相邻站点间的时间间隔
        for (let i = 0; i < timetable.length; i++) {
            const currentStation = timetable[i];
            const nextStation = timetable[i + 1];

            currentStation.detail = this.stations[currentStation.station_code];
            if (nextStation) {
                // 计算当前站到下一站的时间间隔
                const currentTime = this.parseTime(currentStation.first_time);
                const nextTime = this.parseTime(nextStation.first_time);

                // 计算时间间隔（不考虑跨天等特殊情况）
                let timeInterval: number;
                timeInterval = nextTime - currentTime;

                if (timeInterval < 0) {
                    // TODO从同线路别的地铁线，找时间间隔补上
                    // 先找出当前线所有其他线路
                    let nowLine = this.schedule.filter((line: any) => line.lineNo === currentStation.line && line.description !== currentStation.description);
                    // 再根据过滤出的线路，找到同时拥有当前站和下一站的线路
                    let findLine = nowLine.find(l => {
                        let codes = l.timetables.map((ls: any) => ls.station_code)
                        return codes.includes(currentStation.station_code) && codes.includes(nextStation.station_code)
                    })
                    if (!findLine) {
                        console.log(findLine, currentStation, nextStation);
                    }
                    if (findLine) {
                        let findCurrentStation = findLine.timetables.find((ls: any) => ls.station_code === currentStation.station_code);
                        let findNextStation = findLine.timetables.find((ls: any) => ls.station_code === nextStation.station_code);
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
                const lastStation = {
                    nextStation: null,
                    timeInterval: null
                };
                currentStation.intervals = lastStation;
            }
        }

    }

    /**
     * 解析时间字符串为分钟数
     * 
     * @param timeStr 时间字符串，格式如 "05:30"
     * @returns 分钟数
     */
    private parseTime(timeStr: string): number {
        if (!timeStr) return 0;

        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    /**
     * 格式化时间间隔
     * 
     * @param minutes 分钟数
     * @returns 格式化的时间字符串
     */
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


    /**
     * 按 description 分组时刻表数据
     * 
     * @param timetables 时刻表数组
     * @returns 按 description 分组的对象
     */
    private groupTimetablesByDescription(timetables: any[]): { [key: string]: any[] } {
        const grouped: { [key: string]: any[] } = {};

        timetables.forEach(timetable => {
            const description = timetable.description || '未知方向';

            if (!grouped[description]) {
                grouped[description] = [];
            }

            grouped[description].push(timetable);
        });

        return grouped;
    }


}