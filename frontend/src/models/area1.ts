// 1工区业务模型

export interface Area1DashboardData {
  overview: {
    date: string;
    totalPoints: number;
    totalReadings: number;
    exceedDesignLimit: number;
    pendingReview: number;
  };
  healthOk: boolean;
  systemOk: boolean;
}
