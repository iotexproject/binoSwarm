interface ICNNodeLocation {
    [key: string]: number;
}

export interface ICNData {
    totalCapacity: string;
    bookedCapacity: string;
    hardwareProvidersCount: number;
    hyperNodesCount: number;
    scalerNodesCount: number;
    hyperNodesLocation: ICNNodeLocation;
    scalerNodesLocation: ICNNodeLocation;
    ICNLStaked: number;
    ICNTStaked: string;
    ICNLCount: number;
    TVLTotal: string;
    totalUnlocked: string;
    minStakePeriod: string;
    maxICNTEfficiency: string;
}

export interface ICNNetworkStatsResponse {
    $schema: string;
    data: ICNData;
}
