/**
 * 官方原文資料(逐字轉載,01_PERSONAL_HEALTH_PAGE.md §2.4)。
 *
 * 重要原則(R1):本檔內容逐字複製官方原文,含標點與編號;
 * 不得改寫、潤飾、摘要、補充。
 *
 * 來源:環境部空氣品質監測網-空氣品質指標
 * https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx#tg4
 * 資料核對日:2026-11-21
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

export const OFFICIAL_LEVEL_TEXT: OfficialLevelText[] = [
  {
    levelId: 1,
    healthImpact: '空氣品質為良好，污染程度低或無污染。',
    generalAdvice: ['正常戶外活動。'],
    sensitiveAdvice: ['正常戶外活動'],
  },
  {
    levelId: 2,
    healthImpact: '空氣品質普通；但對非常少數之極敏感族群產生輕微影響。',
    generalAdvice: ['正常戶外活動。'],
    sensitiveAdvice: ['極特殊敏感族群建議注意可能產生的咳嗽或呼吸急促症狀，但仍可正常戶外活動。'],
  },
  {
    levelId: 3,
    healthImpact: '空氣污染物可能會對敏感族群的健康造成影響，但是對一般大眾的影響不明顯。',
    generalAdvice: [
      '1.一般民眾如果有不適，如眼痛，咳嗽或喉嚨痛等，應該考慮減少戶外活動。',
      '2.學生仍可進行戶外活動，但建議減少長時間劇烈運動。',
    ],
    sensitiveAdvice: [
      '1.有心臟、呼吸道及心血管疾病患者、孩童及老年人，建議減少體力消耗，特別是減少戶外活動，必要外出應配戴口罩。',
      '2.具有氣喘的人可能需增加使用吸入劑的頻率。',
    ],
  },
  {
    levelId: 4,
    healthImpact: '對所有人的健康開始產生影響，對於敏感族群可能產生較嚴重的健康影響',
    generalAdvice: [
      '1.一般民眾如果有不適，如眼痛，咳嗽或喉嚨痛等，應減少體力消耗，特別是減少戶外活動。',
      '2.學生應避免長時間劇烈運動，進行其他戶外活動時應增加休息時間。',
    ],
    sensitiveAdvice: [
      '1.有心臟、呼吸道及心血管疾病患者、孩童及老年人，建議留在室內並減少體力消耗活動，必要外出應配戴口罩。',
      '2.具有氣喘的人可能需增加使用吸入劑的頻率。',
    ],
  },
  {
    levelId: 5,
    healthImpact: '健康警報：所有人都可能產生較嚴重的健康影響。',
    generalAdvice: [
      '1.一般民眾應減少戶外活動。',
      '2.學生應立即停止戶外活動，並將課程調整於室內進行。',
    ],
    sensitiveAdvice: [
      '1.有心臟、呼吸道及心血管疾病患者、孩童及老年人應留在室內並減少體力消耗活動，必要外出應配戴口罩。',
      '2.具有氣喘的人應增加使用吸入劑的頻率。',
    ],
  },
  {
    levelId: 6,
    healthImpact: '健康威脅達到緊急，所有人都可能受到影響。',
    generalAdvice: [
      '1.一般民眾應避免戶外活動，室內應緊閉門窗，必要外出應配戴口罩等防護用具。',
      '2.學生應立即停止戶外活動，並將課程調整於室內進行。',
    ],
    sensitiveAdvice: [
      '1.有心臟、呼吸道及心血管疾病患者、孩童及老年人應留在室內並避免體力消耗活動，必要外出應配戴口罩。',
      '2.具有氣喘的人應增加使用吸入劑的頻率。',
    ],
  },
];

export interface OfficialPollutantIntro {
  key: 'PM2.5' | 'PM10' | 'O3' | 'NO2' | 'SO2' | 'CO';
  text: string;
  sourceUrl: string;
}

export const OFFICIAL_POLLUTANT_INTRO: Record<OfficialPollutantIntro['key'], OfficialPollutantIntro> = {
  'PM2.5': { key: 'PM2.5', text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  PM10:   { key: 'PM10',  text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  O3:     { key: 'O3',    text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  NO2:    { key: 'NO2',   text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  SO2:    { key: 'SO2',   text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
  CO:     { key: 'CO',    text: '', sourceUrl: 'https://airtw.moenv.gov.tw/CHT/Encyclopedia/pedia03/pedia3.aspx' },
};

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
