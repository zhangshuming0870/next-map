export interface MetroStationData {
    longitude: number;
    latitude: number;
    name: string;
}

export interface MetroLineData {
    name: string;
    color: string;
    stations: MetroStationData[]
}



export interface MetroViewState {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
}

