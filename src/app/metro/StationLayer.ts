import { CompositeLayer } from '@deck.gl/core';
import { IconLayer, TextLayer, PathLayer } from '@deck.gl/layers';
import { MetroLineData, MetroStationData } from './types';

interface StationLayerProps {
    id: string;
    iconAtlas: string;
    getColor?: (d: MetroStationData & { lineColor: string }) => [number, number, number];
    linePaths?: MetroLineData[];
    showStationText?: boolean;
}

export default class StationLayer extends CompositeLayer<StationLayerProps> {
    static layerName = 'StationLayer';

    renderLayers() {
        const { iconAtlas, getColor, linePaths = [] } = this.props;
        const pathLayers = linePaths.map(line => new PathLayer({
            ...this.getSubLayerProps({ id: `path-${line.name}` }),
            data: [line.stations],
            getColor: () => this.hexToRgb(line.color),
            getPath: (d: MetroStationData[]) => d.map(station => [station.longitude, station.latitude]) as [number, number][],
            getWidth: () => 60,
            pickable: true
        }));




        let allStations: Array<MetroStationData & { lineColor: string }> = [];
        linePaths.forEach((line: MetroLineData) => {
            // 收集站点数据
            line.stations.forEach((station: MetroStationData) => {
                allStations.push({ ...station, lineColor: line.color });
            });
        });

        // 使用 URL 直接加载图标，避免 sprite 切片坐标不匹配导致不显示

        return [
            ...pathLayers,
            // 站点图标层
            new IconLayer({
                ...this.getSubLayerProps({
                    id: 'icon',
                    updateTriggers: {
                        getColor: getColor
                    }
                }),
                data: allStations,
                // 直接通过 URL 指定图标，避免 atlas/mapping 配置不当
                getIcon: () => ({
                    url: iconAtlas,
                    width: 32,
                    height: 32,
                    anchorY: 16,
                    mask: true
                }),
                getPosition: (d: MetroStationData & { lineColor?: string }) => [d.longitude, d.latitude],
                getSize: () => 20,
                getColor:  (() => [255, 0, 0]),
                parameters: { depthTest: false },
                pickable: true
            }),

            // 站点文字层
            new TextLayer({
                ...this.getSubLayerProps({
                    id: 'text',
                    updateTriggers: {
                        getColor: getColor
                    }
                }),
                visible: this.props.showStationText === true,
                data: allStations,
                getText: (d: MetroStationData & { lineColor: string }) => d.name,
                getPosition: (d: MetroStationData & { lineColor: string }) => [d.longitude, d.latitude],
                getSize: (d: MetroStationData & { lineColor: string }) => Math.max(12, Math.min(22, d.name.length * 2)),
                sizeUnits: 'pixels',
                getColor: [240, 240, 240],
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'center',
                getAngle: 0,
                fontFamily: 'PingFang SC, Microsoft YaHei, SimHei, sans-serif',
                fontWeight: 'bold',
                characterSet: 'auto',
                pickable: true
            })
        ];
    }

    private hexToRgb(hex: string): [number, number, number] {
        const cleanHex = hex.replace('#', '');
        if (cleanHex.length !== 6) {
            return [255, 0, 0];
        }
        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);
        return [r, g, b];
    }
}
