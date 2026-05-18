export interface MarketTemperature {
  current: {
    date: string;
    value: number;
    level: string;
    percentile: number;
  };
  history: {
    date: string;
    value: number;
  }[];
}

export type TemperatureLevel = '极冷' | '冷' | '适中' | '热' | '极热';
