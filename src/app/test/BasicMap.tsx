"use client";

import React, { useState, useEffect } from "react";
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl';

// 基础视图状态
const initialViewState = {
    longitude: 121.4737,
    latitude: 31.2304,
    zoom: 11,
    pitch: 0,
    bearing: 0
};

// 车辆路径点
const vehiclePath = [
    { longitude: 121.4737, latitude: 31.2304, time: 0 },
    { longitude: 121.4837, latitude: 31.2404, time: 1 },
    { longitude: 121.4937, latitude: 31.2504, time: 2 },
    { longitude: 121.5037, latitude: 31.2604, time: 3 },
    { longitude: 121.5137, latitude: 31.2704, time: 4 },
    { longitude: 121.5237, latitude: 31.2804, time: 5 },
];

export default function BasicMap() {
    const [vehiclePosition, setVehiclePosition] = useState(0);

    // 动画循环
    useEffect(() => {
        const interval = setInterval(() => {
            setVehiclePosition(prev => (prev + 0.1) % vehiclePath.length);
        }, 100);

        return () => clearInterval(interval);
    }, []);

    // 计算当前车辆位置
    const currentIndex = Math.floor(vehiclePosition);
    const nextIndex = (currentIndex + 1) % vehiclePath.length;
    const progress = vehiclePosition - currentIndex;

    const currentPoint = vehiclePath[currentIndex];
    const nextPoint = vehiclePath[nextIndex];

    // 线性插值计算当前位置
    const currentLongitude = currentPoint.longitude + (nextPoint.longitude - currentPoint.longitude) * progress;
    const currentLatitude = currentPoint.latitude + (nextPoint.latitude - currentPoint.latitude) * progress;

    // 车辆图层
    const vehicleLayer = new ScatterplotLayer({
        id: 'vehicle',
        data: [{ longitude: currentLongitude, latitude: currentLatitude }],
        getPosition: d => [d.longitude, d.latitude],
        getRadius: 50,
        getFillColor: [255, 0, 0], // 红色车辆
        getLineColor: [0, 0, 0], // 黑色边框
        getLineWidth: 2,
        pickable: true,
        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale: 6,
        radiusMinPixels: 1,
        radiusMaxPixels: 100,
    });

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <DeckGL
                initialViewState={initialViewState}
                controller={true}
                layers={[vehicleLayer]}
            >
                <Map
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiemhhbmdzaHVtaW5nIiwiYSI6ImNtZTd3bzZoNjA5YmwybHByaGgwM2F2aWEifQ.jhE3aCVxj43jnRC5Zfs9Uw'}
                />
            </DeckGL>
        </div>
    );
}
