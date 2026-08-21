export const palette = {
  // Primary palette - CMYK 0 80 0 0 同色系
  primary: "#315E8F",
  primarySoft: "#C8D8E8",
  primaryMid: "#6F91B2",
  primaryDeep: "#315E8F",
  
  // 特別標籤色系
  accentRed: "#173A5E", // CMYK 10 13 81 0
  accentYellow: "#B88A2E", // CMYK 10 13 81 0
  accentBlue: "#3E8FB8",   // CMYK 46 0 70 0
  accentGreen: "#4F8D7A",  // CMYK 44 0 63 0


  // 基礎色彩
  bgBase: "#EAF1F8",
  bgCard: "#FFFFFF",
  surface: "#FFFFFF",
  background: "#EAF1F8",
  backgroundSecondary: "#F8F9FA",
  
  // 文字色彩
  text: "#172A40",
  textMain: "#172A40",
  textSecondary: "#506780",
  textMuted: "#9CA3AF",
  
  // 邊框與陰影
  borderSoft: "#AFC3D8",
  borderLight: "#E5E7EB",
  shadow: "#173A5E",
} as const;

export const semantic = {
  success: palette.accentGreen,
  warning: palette.accentYellow,
  info: palette.accentBlue,
  danger: palette.accentRed,
} as const;

// 為了相容性，導出 Colors 物件
export const Colors = palette;

export const gradients = {
  page: [palette.bgBase, "#DCE8F3"] as [string, string],
  highlight: [palette.primarySoft, "#C8D8E8"] as [string, string],
} as const;

export const elevation = {
  card: {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;
