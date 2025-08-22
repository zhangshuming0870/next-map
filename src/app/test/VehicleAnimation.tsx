"use client";

import React, { useState, useEffect } from "react";
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, LineLayer, PathLayer } from '@deck.gl/layers';
import Map from 'react-map-gl';

// 基础视图状态
const initialViewState = {
    longitude: 121.4737,
    latitude: 31.2304,
    zoom: 12,
    pitch: 45,
    bearing: 0
};

// 车辆路径点
const vehiclePath = [
    { longitude: 121.4737, latitude: 31.2304, time: 0 },
    { longitude: 121.4837, latitude: 31.2354, time: 1 },
    { longitude: 122.4937, latitude: 31.2404, time: 2 },
    { longitude: 121.5037, latitude: 31.2454, time: 3 },
    { longitude: 121.5137, latitude: 31.2504, time: 4 },
    { longitude: 121.5237, latitude: 31.2554, time: 5 },
    { longitude: 121.5337, latitude: 31.2604, time: 6 },
    { longitude: 121.5437, latitude: 31.2654, time: 7 },
];

export default function VehicleAnimation() {
    const [vehiclePosition, setVehiclePosition] = useState(0);
    const [animationSpeed, setAnimationSpeed] = useState(0.05);

    // 动画循环
    useEffect(() => {
        const interval = setInterval(() => {
            setVehiclePosition(prev => (prev + animationSpeed) % vehiclePath.length);
        }, 50);

        return () => clearInterval(interval);
    }, [animationSpeed]);

    // 计算当前车辆位置
    const currentIndex = Math.floor(vehiclePosition);
    const nextIndex = (currentIndex + 1) % vehiclePath.length;
    const progress = vehiclePosition - currentIndex;

    const currentPoint = vehiclePath[currentIndex];
    const nextPoint = vehiclePath[nextIndex];

    // 线性插值计算当前位置
    const currentLongitude = currentPoint.longitude + (nextPoint.longitude - currentPoint.longitude) * progress;
    const currentLatitude = currentPoint.latitude + (nextPoint.latitude - currentPoint.latitude) * progress;

    // 路径图层
    const pathLayer = new LineLayer({
        id: 'path',
        data: [vehiclePath],
        getPath: (d: any) => d.map((point: any) => [point.longitude, point.latitude]),
        getColor: [100, 100, 100], // 灰色路径
        getWidth: 3,
        opacity: 0.6,
    });

    // 车辆图层
    const vehicleLayer = new ScatterplotLayer({
        id: 'vehicle',
        data: [{ longitude: currentLongitude, latitude: currentLatitude }],
        getPosition: d => [d.longitude, d.latitude],
        getRadius: 30,
        getFillColor: [255, 0, 0], // 红色车辆
        getLineColor: [0, 0, 0], // 黑色边框
        getLineWidth: 2,
        pickable: true,
        opacity: 0.9,
        stroked: true,
        filled: true,
        radiusScale: 6,
        radiusMinPixels: 1,
        radiusMaxPixels: 100,
    });

    const lineLayer = new PathLayer({
        id: 'PathLayer',
        data: [vehiclePath],
        getColor: (d: any) => [0, 100, 255],
        getPath: (d: any) => d.map((point: any) => [point.longitude, point.latitude]),
        getWidth: 100,
        pickable: true
    });




    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* 控制面板 */}
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '5px',
                zIndex: 1000,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ marginBottom: '10px' }}>
                    <label>动画速度: </label>
                    <input
                        type="range"
                        min="0.01"
                        max="0.2"
                        step="0.01"
                        value={animationSpeed}
                        onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                        style={{ width: '100px' }}
                    />
                    <span style={{ marginLeft: '10px' }}>{animationSpeed.toFixed(2)}</span>
                </div>
                <div>
                    当前位置: {currentIndex + 1}/{vehiclePath.length}
                </div>
            </div>

            <DeckGL
                initialViewState={initialViewState}
                controller={true}
                layers={[pathLayer, vehicleLayer, lineLayer]}
            >
                <Map
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiemhhbmdzaHVtaW5nIiwiYSI6ImNtZTd3bzZoNjA5YmwybHByaGgwM2F2aWEifQ.jhE3aCVxj43jnRC5Zfs9Uw'}
                />
            </DeckGL>
        </div>
    );
}
