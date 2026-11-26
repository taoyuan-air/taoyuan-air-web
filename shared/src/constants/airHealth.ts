/**
 * 空氣品質健康常數(純資料,frontend-web 與 frontend-mobile 共用)。
 *
 * 資料來源:
 *  - AQI 六級與副指標濃度區間:環境部「空氣品質指標(114 年啟用)」,
 *    2025-01-01(民國 114 年)起濃度門檻已調整。
 *    https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx
 *  - 法定空氣品質標準:環境部「空氣品質標準」民國 113 年 9 月 30 日修正發布。
 *    https://airtw.moenv.gov.tw/CHT/Information/Standard/Rules.aspx
 *
 * 色碼原則(01_PERSONAL_HEALTH_PAGE.md §2.1):「兩者不同以 dashboard 為準,
 * 以維持全站一致」。此處 hex 採用 frontend-web dashboard 既有 COLORS,而非
 * 官方表列之 EPA 標準色碼(#00E400 等)。darkText 依該色之 WCAG 對比決定。
 */

export interface AqiLevel {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  min: number;
  max: number;
  label: '良好' | '普通' | '對敏感族群不健康' | '對所有族群不健康' | '非常不健康' | '危害';
  en: string;
  colorName: '綠' | '黃' | '橘' | '紅' | '紫' | '褐紅';
  hex: string;
  /** 該色作為底色時是否需用深色字(對比度不足時為 true) */
  darkText: boolean;
}

export const AQI_LEVELS: AqiLevel[] = [
  { id: 1, min: 0, max: 50, label: '良好', en: 'Good', colorName: '綠', hex: '#4caf50', darkText: true },
  { id: 2, min: 51, max: 100, label: '普通', en: 'Moderate', colorName: '黃', hex: '#edbb05', darkText: true },
  { id: 3, min: 101, max: 150, label: '對敏感族群不健康', en: 'Unhealthy for Sensitive Groups', colorName: '橘', hex: '#ff9800', darkText: true },
  { id: 4, min: 151, max: 200, label: '對所有族群不健康', en: 'Unhealthy', colorName: '紅', hex: '#f44336', darkText: false },
  { id: 5, min: 201, max: 300, label: '非常不健康', en: 'Very Unhealthy', colorName: '紫', hex: '#9c27b0', darkText: false },
  { id: 6, min: 301, max: 500, label: '危害', en: 'Hazardous', colorName: '褐紅', hex: '#7E0023', darkText: false },
];

export type Pollutant = 'PM2.5' | 'PM10' | 'O3_8h' | 'O3_1h' | 'CO_8h' | 'SO2_1h' | 'NO2_1h';
export type Range = [number, number] | null;

/**
 * 官方「污染物濃度與副指標對照表」,索引 0..5 對應 AQI_LEVELS id 1..6。
 * `null` 表示該級不以此項計算(如 O₃ 8h 第 6 級改用 1h;O₃ 1h 第 1、2 級不計算)。
 * 單位見 POLLUTANT_UNITS。
 */
export const POLLUTANT_BREAKPOINTS: Record<Pollutant, Range[]> = {
  'PM2.5': [[0, 12.4], [12.5, 30.4], [30.5, 50.4], [50.5, 125.4], [125.5, 225.4], [225.5, 500.4]],
  PM10: [[0, 30], [31, 75], [76, 190], [191, 354], [355, 424], [425, 604]],
  O3_8h: [[0, 0.054], [0.055, 0.07], [0.071, 0.085], [0.086, 0.105], [0.106, 0.2], null],
  O3_1h: [null, null, [0.101, 0.134], [0.135, 0.204], [0.205, 0.404], [0.405, 0.604]],
  CO_8h: [[0, 4.4], [4.5, 9.4], [9.5, 12.4], [12.5, 15.4], [15.5, 30.4], [30.5, 50.4]],
  SO2_1h: [[0, 8], [9, 65], [66, 160], [161, 304], [305, 604], [605, 1004]],
  NO2_1h: [[0, 21], [22, 100], [101, 360], [361, 649], [650, 1249], [1250, 2049]],
};

export const POLLUTANT_UNITS: Record<Pollutant, string> = {
  'PM2.5': 'μg/m³',
  PM10: 'μg/m³',
  O3_8h: 'ppm',
  O3_1h: 'ppm',
  CO_8h: 'ppm',
  SO2_1h: 'ppb',
  NO2_1h: 'ppb',
};

export interface AirStandard {
  key: string;
  pollutant: string;
  period: string;
  value: number;
  unit: string;
}

/** 空氣品質標準,民國 113 年 9 月 30 日修正發布。PM2.5 已由舊版 35/15 加嚴為 30/12。 */
export const AIR_STANDARDS_META = {
  version: '民國 113 年 9 月 30 日修正發布',
  sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Information/Standard/Rules.aspx',
  retrievedAt: '2026-11-21',
} as const;

export const AIR_STANDARDS: Record<string, AirStandard> = {
  pm25_24h: { key: 'pm25_24h', pollutant: 'PM2.5', period: '24 小時值', value: 30, unit: 'μg/m³' },
  pm25_year: { key: 'pm25_year', pollutant: 'PM2.5', period: '年平均值', value: 12, unit: 'μg/m³' },
  pm10_24h: { key: 'pm10_24h', pollutant: 'PM10', period: '日平均值', value: 75, unit: 'μg/m³' },
  pm10_year: { key: 'pm10_year', pollutant: 'PM10', period: '年平均值', value: 30, unit: 'μg/m³' },
  o3_8h: { key: 'o3_8h', pollutant: 'O₃', period: '八小時平均值', value: 0.06, unit: 'ppm' },
  o3_1h: { key: 'o3_1h', pollutant: 'O₃', period: '小時平均值', value: 0.1, unit: 'ppm' },
  no2_1h: { key: 'no2_1h', pollutant: 'NO₂', period: '小時平均值', value: 0.1, unit: 'ppm' },
  no2_year: { key: 'no2_year', pollutant: 'NO₂', period: '年平均值', value: 0.021, unit: 'ppm' },
  so2_1h: { key: 'so2_1h', pollutant: 'SO₂', period: '小時平均值', value: 0.065, unit: 'ppm' },
  so2_year: { key: 'so2_year', pollutant: 'SO₂', period: '年平均值', value: 0.008, unit: 'ppm' },
  co_8h: { key: 'co_8h', pollutant: 'CO', period: '八小時平均值', value: 9, unit: 'ppm' },
  co_1h: { key: 'co_1h', pollutant: 'CO', period: '小時平均值', value: 31, unit: 'ppm' },
};

/** 官方第四條附註:此標準僅供數值對照,不作為達標與否之判定。 */
export const AIR_STANDARDS_NOTE =
  '空氣品質標準用於各空氣污染物防制區長期達標判定(以連續三年統計),此處僅供數值對照,不作為達標與否之判定。';
