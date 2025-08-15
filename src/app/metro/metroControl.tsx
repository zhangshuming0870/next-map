"use client";

import React, { useEffect } from "react";
import { DeckGL } from '@deck.gl/react';
import Map from 'react-map-gl';
import { MetroViewState } from './types';
import Metro from "./metro";

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
                setLayers(metroInstance.getLayers());
                setIsLoading(false);
            } catch (error) {
                console.error('Failed to initialize metro:', error);
                setIsLoading(false);
            }
        };
        initMap();
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
            >
                <Map
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiemhhbmdzaHVtaW5nIiwiYSI6ImNtZTd3bzZoNjA5YmwybHByaGgwM2F2aWEifQ.jhE3aCVxj43jnRC5Zfs9Uw'}
                />
            </DeckGL>
        </div>
    );
}
