export interface ICNCapacity {
    [key: string]: number;
}

export interface ICNNodeLocation {
    [key: string]: number;
}

export interface ICNData {
    totalCapacity: ICNCapacity;
    bookedCapacity: ICNCapacity;
    hardwareProvidersCount: number;
    hyperNodesCount: number;
    scalerNodesCount: number;
    hyperNodesLocation: ICNNodeLocation;
    scalerNodesLocation: ICNNodeLocation;
    ICNLStaked: number;
    ICNTStaked: number;
    ICNLCount: number;
    TVLTotal: string; // Represented as a string in the API response
}

export interface ICNNetworkStatsResponse {
    $schema: string;
    data: ICNData;
}
