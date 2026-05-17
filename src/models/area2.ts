// 2工区业务模型

export interface Area2DashboardData {
  overview: {
    currentRing: number;
    minRing: number;
    maxRing: number;
    totalParameters: number;
    totalMonitoringReadings: number;
  };
  healthOk: boolean;
  systemOk: boolean;
}
