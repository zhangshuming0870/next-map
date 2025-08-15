import { CompositeLayer } from '@deck.gl/core';
import { PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';

/**
 * 动画地铁列车图层属性接口
 * 定义创建动画地铁列车所需的所有配置参数
 */
interface AnimatedTrainLayerProps {
    /** 图层的唯一标识符 */
    id: string;
    /** 地铁线路数据数组，包含路径和颜色信息 */
    data: any[];
    /** 获取车厢颜色的函数，返回RGB数组 [r, g, b] */
    getColor?: (d: any) => [number, number, number];
    /** 动画速度，控制列车移动的快慢，值越大移动越快 */
    animationSpeed?: number;
}

/**
 * 动画地铁列车图层类
 * 继承自 CompositeLayer，用于创建沿地铁线路移动的动画列车
 * 包含主车厢（矩形）和顶部装饰（圆形）两个子图层
 */
export default class AnimatedTrainLayer extends CompositeLayer<AnimatedTrainLayerProps> {
    /** 图层名称，用于调试和识别 */
    static layerName = 'AnimatedTrainLayer';
    
    /**
     * 图层状态接口定义
     * 存储动画相关的状态信息
     */
    state!: {
        /** 动画帧ID，用于取消动画 */
        animationFrame: number;
        /** 当前动画时间，用于计算列车位置 */
        currentTime: number;
    };

    /**
     * 初始化图层状态
     * 设置初始时间并启动动画循环
     */
    initializeState() {
        // 初始化状态：动画帧ID和当前时间
        this.setState({
            animationFrame: 0,
            currentTime: 0
        });
        
        // 启动动画循环
        this.startAnimation();
    }

    /**
     * 启动动画循环
     * 使用 requestAnimationFrame 创建平滑的动画效果
     */
    startAnimation() {
        const animate = () => {
            // 获取动画速度，默认值为 0.0005
            const animationSpeed = this.props.animationSpeed || 0.0005;
            
            // 更新当前时间，推动动画前进
            this.setState({
                currentTime: this.state.currentTime + animationSpeed
            });
            
            // 设置变化标志，触发图层重新渲染
            this.setChangeFlags({
                somethingChanged: true
            });
            
            // 继续下一帧动画
            this.state.animationFrame = requestAnimationFrame(animate);
        };
        
        // 启动动画循环
        this.state.animationFrame = requestAnimationFrame(animate);
    }

   
    
    /**
     * 清理图层状态
     * 取消动画帧，防止内存泄漏
     */
    finalizeState() {
        // 清理动画帧
        if (this.state.animationFrame) {
            cancelAnimationFrame(this.state.animationFrame);
        }
    }

    /**
     * 渲染子图层
     * 创建主车厢（矩形）和顶部装饰（圆形）两个图层
     */
    renderLayers() {
        const { data, getColor } = this.props;
        const { currentTime } = this.state;

        // 根据当前时间计算动画位置和朝向
        const animatedData = data.map((d: any, index: number) => {
            // 计算动画进度，添加偏移量避免所有列车同步
            const progress = (currentTime + index * 0.1) % 1;
            
            // 计算列车当前位置
            const position = this.interpolatePosition(d.path, progress, d.stations);
            
            // 计算列车朝向角度
            const angle = this.calculatePathAngle(d.path, progress);
            
            // 获取当前列车所在的站点信息
            const currentStation = this.getCurrentStation(d.stations, progress);
            
            return {
                ...d,
                progress,
                animatedPosition: position,
                pathAngle: angle,
                currentStation: currentStation.name,
                stationPosition: [currentStation.longitude, currentStation.latitude]
            };
        });

        return [
            // 主车厢图层 - 使用 PolygonLayer 创建矩形车厢
            new PolygonLayer({
                ...this.getSubLayerProps({
                    id: 'animated-train-polygon',
                    // 当 currentTime 变化时触发位置更新
                    updateTriggers: {
                        getPolygon: ['currentTime']
                    }
                }),
                data: animatedData,
                // 根据位置和角度创建矩形车厢多边形
                getPolygon: (d: any) => this.createTrainPolygon(d.animatedPosition, d.pathAngle),
                // 获取车厢填充颜色
                getFillColor: getColor || (() => [255, 0, 0]),
                // 车厢边框颜色（深灰色）
                getLineColor: [100, 100, 100],
                // 边框宽度
                getLineWidth: 2,
                // 允许鼠标交互
                pickable: true,
                // 图层透明度
                opacity: 0.3,
                // 启用边框绘制
                stroked: true,
                // 启用填充绘制
                filled: true,
                // 3D效果设置
                extruded: true, // 启用3D拉伸
                elevationScale: 0.2, // 车厢高度（相对较小，保持扁平效果）
            }),
            // 站点信息图层 - 使用 TextLayer 显示当前站点
            new TextLayer({
                ...this.getSubLayerProps({
                    id: 'train-station-text',
                    // 当 currentTime 变化时触发位置更新
                    updateTriggers: {
                        getText: ['currentTime']
                    }
                }),
                data: animatedData,
                // 获取站点名称
                getText: (d: any) => d.currentStation || '未知站点',
                // 获取文字位置（在列车上方显示）
                getPosition: (d: any) => {
                    const [lon, lat] = d.animatedPosition;
                    // 在列车上方显示站点信息
                    return [lon, lat + 0.002, 0];
                },
                // 站点文字颜色
                getColor: [255, 255, 255],
                // 站点文字大小
                getSize: 16,
                characterSet: 'auto',

            })
        ];
    }

    /**
     * 在路径上插值计算列车位置
     * 根据动画进度在路径点之间进行线性插值，并在站点处停留30秒
     * 
     * @param path 路径点数组，每个点是 [longitude, latitude]
     * @param progress 动画进度，范围 0-1
     * @param stations 站点信息数组
     * @returns 插值后的位置坐标 [longitude, latitude]
     */
    private interpolatePosition(path: [number, number][], progress: number, stations: any[]): [number, number] {
        // 检查路径有效性
        if (!path || path.length < 2) return [0, 0];
        
        // 计算路径总长度（段数）
        const totalLength = path.length - 1;
        
        // 计算实际进度，考虑站点停留时间
        const adjustedProgress = this.calculateAdjustedProgress(progress, stations);
        
        // 根据调整后的进度计算当前段索引
        const index = adjustedProgress * totalLength;
        // 当前段的起始索引
        const currentIndex = Math.floor(index);
        // 当前段的结束索引（确保不越界）
        const nextIndex = Math.min(currentIndex + 1, path.length - 1);
        // 在当前段内的局部进度
        const localProgress = index - currentIndex;
        
        // 获取当前段的两端点
        const currentPoint = path[currentIndex];
        const nextPoint = path[nextIndex];
        
        // 线性插值计算当前位置
        return [
            currentPoint[0] + (nextPoint[0] - currentPoint[0]) * localProgress,
            currentPoint[1] + (nextPoint[1] - currentPoint[1]) * localProgress
        ];
    }

    /**
     * 计算考虑站点停留时间的调整进度
     * 在每个站点停留30秒（0.5秒的动画时间）
     * 
     * @param progress 原始进度 0-1
     * @param stations 站点信息数组
     * @returns 调整后的进度
     */
    private calculateAdjustedProgress(progress: number, stations: any[]): number {
        if (!stations || stations.length < 2) return progress;
        
        const totalStations = stations.length;
        const segmentProgress = 1 / (totalStations - 1); // 每段路径的进度
        
        // 计算当前列车在哪个路径段
        const currentSegment = Math.floor(progress * (totalStations - 1));
        const segmentStartProgress = currentSegment * segmentProgress;
        
        // 计算在当前段内的进度
        const segmentLocalProgress = (progress - segmentStartProgress) / segmentProgress;
        
        // 优化的站点停留逻辑：当列车车厢完全位于站点中心时才停留
        // 这样可以避免突然的减速，让起步更平滑
        if (segmentLocalProgress > 0.95 && currentSegment < totalStations - 1) {
            // 当列车几乎完全到达站点中心时才开始停留
            // 进度保持在0.95，确保列车在站点中心停留
            return segmentStartProgress + 0.95 * segmentProgress;
        }
        
        // 其他情况正常移动，不进行任何调整
        // 这样列车在接近站点时会自然减速，到达站点中心时停留
        return progress;
    }

    /**
     * 获取当前列车所在的站点信息
     * 
     * @param stations 站点信息数组
     * @param progress 动画进度
     * @returns 当前站点信息
     */
    private getCurrentStation(stations: any[], progress: number): any {
        if (!stations || stations.length < 2) return { name: '未知站点', longitude: 0, latitude: 0 };

        const totalStations = stations.length;
        const segmentProgress = 1 / (totalStations - 1); // 每段路径的进度

        // 计算当前列车在哪个路径段
        const currentSegment = Math.floor(progress * (totalStations - 1));
        const segmentStartProgress = currentSegment * segmentProgress;

        // 计算在当前段内的进度
        const segmentLocalProgress = (progress - segmentStartProgress) / segmentProgress;

        // 找到当前站点
        let currentStationIndex = currentSegment;
        if (segmentLocalProgress > 0.8) {
            currentStationIndex = Math.min(currentSegment + 1, totalStations - 1);
        }

        return stations[currentStationIndex];
    }

    /**
     * 创建地铁车厢的多边形形状
     * 根据位置和朝向创建矩形的四个顶点
     * 
     * @param position 车厢中心位置 [longitude, latitude]
     * @param angle 车厢朝向角度（弧度）
     * @returns 矩形多边形的四个顶点坐标
     */
    private createTrainPolygon(position: [number, number], angle: number): [number, number][] {
        // 提取经纬度坐标
        const [longitude, latitude] = position;
        // 车厢尺寸设置（以经纬度为单位）
        const width = 0.003;   // 车厢宽度（经度方向）
        const height = 0.0015; // 车厢长度（纬度方向）
        
        // 使用传入的角度参数
        
        // 计算角度的三角函数值
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // 创建矩形的四个顶点
        // 使用旋转矩阵计算每个顶点的位置
        const vertices: [number, number][] = [
            // 左上角顶点
            [longitude - width * cos - height * sin, latitude - width * sin + height * cos],
            // 右上角顶点
            [longitude + width * cos - height * sin, latitude + width * sin + height * cos],
            // 右下角顶点
            [longitude + width * cos + height * sin, latitude + width * sin - height * cos],
            // 左下角顶点
            [longitude - width * cos + height * sin, latitude - width * sin - height * cos]
        ];
        
        return vertices;
    }

    /**
     * 计算路径方向角度
     * 根据路径点和进度计算列车应该朝向的角度
     * 
     * @param path 路径点数组
     * @param progress 动画进度
     * @returns 路径方向角度（弧度）
     */
    private calculatePathAngle(path: [number, number][], progress: number): number {
        // 检查路径有效性
        if (!path || path.length < 2) return 0;
        
        // 计算路径总长度（段数）
        const totalLength = path.length - 1;
        // 根据进度计算当前段索引
        const index = progress * totalLength;
        // 当前段的起始索引
        const currentIndex = Math.floor(index);
        // 当前段的结束索引（确保不越界）
        const nextIndex = Math.min(currentIndex + 1, path.length - 1);
        
        // 获取当前段的两端点
        const currentPoint = path[currentIndex];
        const nextPoint = path[nextIndex];
        
        // 计算两点之间的方向向量
        const deltaLon = nextPoint[0] - currentPoint[0]; // 经度差
        const deltaLat = nextPoint[1] - currentPoint[1]; // 纬度差
        
        // 使用 atan2 计算方向角度
        // atan2(deltaLat, deltaLon) 返回从正东方向到目标方向的角度
        return Math.atan2(deltaLat, deltaLon);
    }
}
