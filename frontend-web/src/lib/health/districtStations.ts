/**
 * 行政區 → 參考測站(靜態對照表)。
 *
 * 桃園市 13 個行政區只有 6 個環境部測站,因此畫面一律標示「參考測站:XX 站」,
 * 不可寫成「該行政區的空氣品質」。
 *
 * 對照原則:以行政區中心到測站直線距離最近。本表為 01_PERSONAL_HEALTH_PAGE.md §5.3
 * 指定之初版。與 dashboard 的 EPA_STATION_TO_DISTRICT(站→單一區)方向相反;
 * 兩者衝突時以本表為準(dashboard 改引用本表列入附錄 B,不在本文件實作)。
 */

export type MoeStation = '中壢' | '桃園' | '大園' | '觀音' | '平鎮' | '龍潭';

export const MOE_STATIONS: MoeStation[] = ['中壢', '桃園', '大園', '觀音', '平鎮', '龍潭'];

export const DISTRICTS = [
  '桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區',
  '龜山區', '大園區', '觀音區', '新屋區', '龍潭區', '復興區',
] as const;
export type District = (typeof DISTRICTS)[number];

export const DISTRICT_REFERENCE_STATION: Record<District, MoeStation> = {
  桃園區: '桃園', 八德區: '桃園', 蘆竹區: '桃園', 龜山區: '桃園',
  中壢區: '中壢',
  平鎮區: '平鎮', 楊梅區: '平鎮',
  大園區: '大園',
  觀音區: '觀音', 新屋區: '觀音',
  龍潭區: '龍潭', 大溪區: '龍潭', 復興區: '龍潭',
};

export function referenceStationFor(district: string): MoeStation {
  return (DISTRICT_REFERENCE_STATION as Record<string, MoeStation>)[district] ?? '桃園';
}
