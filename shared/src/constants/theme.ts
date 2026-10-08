export const palette = {
  primary: "#4895EC",
  primarySoft: "#DBEAFE",
  primaryMid: "#93C5FD",
  primaryDeep: "#2871CC",
  accentRed: "#E94C78",
  accentYellow: "#d7ae29",
  accentBlue: "#8AB3FF",
  accentGreen: "#79b360",
  bgBase: "#F0F6FF",
  bgCard: "#FFFFFF",
  surface: "#FFFFFF",
  background: "#F0F6FF",
  backgroundSecondary: "#F8F9FA",
  text: "#0F1D3A",
  textMain: "#0F1D3A",
  textSecondary: "#4A6080",
  textMuted: "#9CA3AF",
  borderSoft: "#BFDBFE",
  borderLight: "#E5E7EB",
  shadow: "#1E3A5F",
} as const;

export const semantic = {
  success: palette.accentGreen,
  warning: palette.accentYellow,
  info: palette.accentBlue,
  danger: palette.accentRed,
} as const;

export const Colors = palette;

export const gradients = {
  page: [palette.bgBase, "#E0EEFF"] as [string, string],
  highlight: [palette.primarySoft, "#C7DCFF"] as [string, string],
} as const;
