import { CompositeLayer } from '@deck.gl/core';
import { IconLayer, TextLayer } from '@deck.gl/layers';
import { MetroStationData } from './types';

interface StationLayerProps {
    id: string;
    data: Array<MetroStationData & { lineColor: string }>;
    iconAtlas: string;
    iconMapping: any;
    getColor?: (d: MetroStationData & { lineColor: string }) => [number, number, number];
}

export default class StationLayer extends CompositeLayer<StationLayerProps> {
    static layerName = 'StationLayer';

    renderLayers() {
        const { data, iconAtlas, iconMapping, getColor } = this.props;

        return [
            // 站点图标层
            new IconLayer({
                ...this.getSubLayerProps({
                    id: 'icon',
                    updateTriggers: {
                        getColor: getColor
                    }
                }),
                data,
                getIcon: () => 'metro',
                getPosition: (d: MetroStationData & { lineColor?: string }) => [d.longitude, d.latitude],
                getSize: () => 10,
                getColor: getColor || (() => [255, 0, 0]),
                iconAtlas,
                iconMapping,
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
                data,
                getText: (d: MetroStationData & { lineColor: string }) => d.name,
                getPosition: (d: MetroStationData & { lineColor: string }) => [d.longitude, d.latitude],
                getSize: (d: MetroStationData & { lineColor: string }) => Math.max(8, Math.min(16, d.name.length * 2)),
                getColor: [255, 255, 255],
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
}
