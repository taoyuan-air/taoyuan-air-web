/**
 * 官方原文資料(逐字轉載,01_PERSONAL_HEALTH_PAGE.md §2.4)。
 *
 * 重要原則(R1):本檔內容必須逐字複製官方原文,含標點與編號;
 * 開發者與 AI 不得改寫、潤飾、摘要、補充。內容填入前由第二人對照官方頁核對。
 *
 * 目前狀態:尚未填入逐字原文。在 OFFICIAL_LEVEL_TEXT / OFFICIAL_POLLUTANT_INTRO
 * 為空時,UI 一律顯示「前往官方原文」外連結,不得以自行撰寫之文字代替。
 *
 * 待填入來源:
 *  - 六級「人體健康影響」「一般民眾活動建議」「敏感性族群活動建議」:
 *      環境部空氣品質監測網-空氣品質指標
 *      https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx#tg4
 *  - 污染物介紹文字:環境部-污染物特性
 *      https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx
 */

export interface OfficialLevelText {
  levelId: 1 | 2 | 3 | 4 | 5 | 6;
  /** 人體健康影響(官方原文) */
  healthImpact: string;
  /** 一般民眾活動建議(官方原文,每個編號項目一個元素) */
  generalAdvice: string[];
  /** 敏感性族群活動建議(官方原文) */
  sensitiveAdvice: string[];
}

export const OFFICIAL_SOURCE = {
  name: '環境部空氣品質監測網-空氣品質指標',
  url: 'https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx#tg4',
  retrievedAt: '2026-11-21',
} as const;

/**
 * 六級官方原文。內容未填入前為空陣列;此時 UI 顯示「前往官方原文」連結。
 * 填入時須逐字複製官方表(含「1.」「2.」等編號),並由第二人核對。
 */
export const OFFICIAL_LEVEL_TEXT: OfficialLevelText[] = [
  // { levelId: 1, healthImpact: '…逐字複製…', generalAdvice: ['…'], sensitiveAdvice: ['…'] },
  // …共 6 筆
];

export interface OfficialPollutantIntro {
  /** 對應的污染物名稱顯示用 */
  key: 'PM2.5' | 'PM10' | 'O3' | 'NO2' | 'SO2' | 'CO';
  /** 官方介紹原文;尚未填入時為空字串,UI 改顯示外連結 */
  text: string;
  /** 官方污染物特性頁網址 */
  sourceUrl: string;
}

/** 污染物小百科官方介紹;尚未逐字填入時 text 為空字串。 */
export const OFFICIAL_POLLUTANT_INTRO: Record<OfficialPollutantIntro['key'], OfficialPollutantIntro> = {
  'PM2.5': { key: 'PM2.5', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  PM10: { key: 'PM10', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  O3: { key: 'O3', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  NO2: { key: 'NO2', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  SO2: { key: 'SO2', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  CO: { key: 'CO', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
};

/** 官方防護資訊連結(M6)。只放連結,不轉寫內容。 */
export const OFFICIAL_PROTECT_LINKS = [
  {
    title: '環境部空氣品質指標',
    desc: 'AQI 六級與活動建議(官方公告)',
    url: 'https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx',
  },
  {
    title: '環境部空氣品質防護資訊',
    desc: '空氣污染自我防護說明',
    url: 'https://airtw.moenv.gov.tw/CHT/airprotect.aspx',
  },
  {
    title: '衛福部國健署-空污自我保護',
    desc: '國民健康署空氣污染健康防護',
    url: 'https://mohw.gov.tw/cp-2704-82237-1.html',
  },
] as const;
