// plotly.js-dist-min 沒有官方 .d.ts，使用 plotly.js 的型別宣告作為替代
declare module 'plotly.js-dist-min' {
  export * from 'plotly.js';
  export { default } from 'plotly.js';
}
