// 統一的 API base：本機開發預設 '/api'，Production 由 NEXT_PUBLIC_API_BASE 設定
// （例如 /tyair 部署時設為 '/tyair/api'）。所有呼叫 /api/* 的地方都應該經過這裡，
// 不要在元件裡直接寫死 '/api/...'。
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
