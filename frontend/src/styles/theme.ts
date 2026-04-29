export const palette = {
  // Primary palette - CMYK 0 80 0 0 同色系
  primary: "#E76595",
  primarySoft: "#F8D0DA",
  primaryMid: "#FBA7BC",
  primaryDeep: "#E76595",
  
  // 特別標籤色系
  accentYellow: "#E6DE30", // CMYK 10 13 81 0
  accentBlue: "#8AB3FF",   // CMYK 46 0 70 0
  accentGreen: "#8FFF5E",  // CMYK 44 0 63 0

  // 基礎色彩
  bgBase: "#FFF6F9",
  bgCard: "#FFFFFF",
  surface: "#FFFFFF",
  background: "#FFF6F9",
  backgroundSecondary: "#F8F9FA",
  
  // 文字色彩
  text: "#3A1E2D",
  textMain: "#3A1E2D",
  textSecondary: "#7F5A6A",
  textMuted: "#9CA3AF",
  
  // 邊框與陰影
  borderSoft: "#F6C8D6",
  borderLight: "#E5E7EB",
  shadow: "#5E2A42",
} as const;

export const semantic = {
  success: palette.accentGreen,
  warning: palette.accentYellow,
  info: palette.accentBlue,
  danger: "#E94C78",
} as const;

// 為了相容性，導出 Colors 物件
export const Colors = palette;

export const gradients = {
  page: [palette.bgBase, "#FFEAF0"] as [string, string],
  highlight: [palette.primarySoft, "#FFE1EA"] as [string, string],
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
