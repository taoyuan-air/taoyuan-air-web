'use client';

/**
 * WindLidarPanel — 單一 Plotly heatmap 面板（含可選風向箭頭）
 *
 * 使用 plotly.js-dist-min 動態載入（避免 SSR / bundle 問題）。
 * 父元件須以 dynamic(..., { ssr: false }) 引入此元件。
 */

import { useCallback, useEffect, useRef } from 'react';

// ── Plotly 型別（僅供 TypeScript 用） ────────────────────────────────────────
type PlotlyModule = typeof import('plotly.js-dist-min');

let _plotlyCache: PlotlyModule | null = null;

// ── 中文語系字典（modebar 按鈕提示文字） ────────────────────────────────────
const ZH_LOCALE = {
  moduleType: 'locale',
  name: 'zh-TW',
  dictionary: {
    'Download plot as a png': '下載圖片',
    'Zoom': '縮放',
    'Pan': '平移',
    'Zoom in': '放大',
    'Zoom out': '縮小',
    'Autoscale': '自動縮放',
    'Reset axes': '重設座標軸',
    'Toggle Spike Lines': '顯示輔助線',
    'Show closest data on hover': '顯示最近資料點',
    'Compare data on hover': '比較資料點',
    'Box Select': '框選',
    'Lasso Select': '套索選取',
    'Taking snapshot - this may take a few seconds': '正在截圖，請稍候',
    'Snapshot succeeded': '截圖完成',
    'Double-click to zoom back out': '雙擊縮放回原始大小',
  },
  format: {},
};

async function getPlotly(): Promise<PlotlyModule> {
  if (!_plotlyCache) {
    _plotlyCache = (await import('plotly.js-dist-min')) as unknown as PlotlyModule;
    _plotlyCache.register(ZH_LOCALE as never);
  }
  return _plotlyCache;
}

// ── 色標定義 ──────────────────────────────────────────────────────────────────
const JET_COLORSCALE: [number, string][] = [
  [0,     'rgb(0,0,131)'],
  [0.125, 'rgb(0,60,170)'],
  [0.25,  'rgb(5,255,255)'],
  [0.375, 'rgb(100,255,150)'],
  [0.5,   'rgb(255,255,0)'],
  [0.625, 'rgb(255,165,0)'],
  [0.75,  'rgb(250,60,0)'],
  [0.875, 'rgb(180,0,0)'],
  [1,     'rgb(128,0,0)'],
];

// 風向循環色標
const WIND_DIR_COLORSCALE: [number, string][] = [
  [0 / 360,   '#1010FF'],  // N   0°
  [45 / 360,  '#6600CC'],  // NE  45°
  [90 / 360,  '#2255FF'],  // E   90°
  [135 / 360, '#33AAFF'],  // SE  135°
  [180 / 360, '#FFAAAA'],  // S   180°
  [225 / 360, '#FF2200'],  // SW  225°
  [270 / 360, '#00CCFF'],  // W   270°
  [315 / 360, '#0055EE'],  // NW  315°
  [360 / 360, '#1010FF'],  // N   360°（循環封閉）
];

export type ColorscaleSpec = 'Jet' | 'WindDir' | 'RdBu' | 'Viridis' | 'Plasma';

const COLORSCALE_MAP: Record<ColorscaleSpec, unknown> = {
  Jet:     JET_COLORSCALE,
  WindDir: WIND_DIR_COLORSCALE,
  RdBu:    'RdBu',
  Viridis: 'Viridis',
  Plasma:  'Plasma',
};

// ── 方向箭頭降採樣（水平風向用：固定大小 arrow marker，方向代表風從哪來） ──────
const MAX_ARROW_T = 40;
const MAX_ARROW_H = 15;

function buildArrowTrace(
  wdirZ: (number | null)[][],
  times: string[],
  heightsKm: number[],
): unknown {
  const nH = heightsKm.length;
  const nT = times.length;
  const stepT = Math.max(1, Math.floor(nT / MAX_ARROW_T));
  const stepH = Math.max(1, Math.floor(nH / MAX_ARROW_H));

  const ax: string[] = [];
  const ay: number[] = [];
  const angles: number[] = [];

  for (let hi = 0; hi < nH; hi += stepH) {
    for (let ti = 0; ti < nT; ti += stepT) {
      const wdir = wdirZ[hi]?.[ti];
      if (wdir !== null && wdir !== undefined) {
        ax.push(times[ti]);
        ay.push(heightsKm[hi]);
        angles.push((wdir + 180) % 360);
      }
    }
  }

  return {
    type: 'scatter',
    mode: 'markers',
    x: ax,
    y: ay,
    marker: {
      symbol: 'arrow',
      size: 8,
      angle: angles,
      color: 'rgba(255,255,255,0.85)',
      line: { color: 'rgba(0,0,0,0.3)', width: 0.5 },
    },
    hoverinfo: 'skip',
    showlegend: false,
  };
}

/**
 * 垂直風向箭頭（Vertical Wind Profile 用）
 * X 方向帶 0，Y 方向帶 Vsp → 箭頭只有 ↑（上升）或 ↓（下降）
 * 角度規則：Vsp > 0 → 朝上（0°），Vsp < 0 → 朝下（180°）
 */
function buildVerticalArrowTrace(
  vspZ: (number | null)[][],
  times: string[],
  heightsKm: number[],
): unknown {
  const nH = heightsKm.length;
  const nT = times.length;
  const stepT = Math.max(1, Math.floor(nT / MAX_ARROW_T));
  const stepH = Math.max(1, Math.floor(nH / MAX_ARROW_H));

  const ax: string[] = [];
  const ay: number[] = [];
  const angles: number[] = [];

  for (let hi = 0; hi < nH; hi += stepH) {
    for (let ti = 0; ti < nT; ti += stepT) {
      const vsp = vspZ[hi]?.[ti];
      if (vsp !== null && vsp !== undefined) {
        ax.push(times[ti]);
        ay.push(heightsKm[hi]);
        // Vsp > 0 上升 → 箭頭朝上（0°）；Vsp < 0 下降 → 箭頭朝下（180°）
        angles.push(vsp >= 0 ? 0 : 180);
      }
    }
  }

  return {
    type: 'scatter',
    mode: 'markers',
    x: ax,
    y: ay,
    marker: {
      symbol: 'arrow',
      size: 8,
      angle: angles,
      color: 'rgba(255,255,255,0.85)',
      line: { color: 'rgba(0,0,0,0.3)', width: 0.5 },
    },
    hoverinfo: 'skip',
    showlegend: false,
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface WindLidarPanelProps {
  title: string;
  times: string[];
  heightsKm: number[];
  z: (number | null)[][];
  colorscale: ColorscaleSpec;
  zmin: number;
  zmax: number;
  unit: string;
  showArrows: boolean;
  /** 'horizontal'（預設）：用 wdirZ 畫風向符號；'vertical'：用 z 自身畫 ↑↓ 箭頭 */
  arrowType?: 'horizontal' | 'vertical';
  wdirZ?: (number | null)[][];      // arrowType='horizontal' 時需要
  xRange?: [string, string] | null;
  onRelayout?: (event: Record<string, unknown>) => void;
  onDoubleClick?: () => void;
}

const CHART_HEIGHT = 260;

const C = {
  rose:      '#D4567A',
  hint:      '#b0a0b8',
  glass:     'rgba(255,255,255,0.90)',
  glassShadow: '0 4px 20px rgba(180,140,160,0.12)',
};

// ── 元件 ──────────────────────────────────────────────────────────────────────
export default function WindLidarPanel({
  title,
  times,
  heightsKm,
  z,
  colorscale,
  zmin,
  zmax,
  unit,
  showArrows,
  arrowType = 'horizontal',
  wdirZ,
  xRange,
  onRelayout,
  onDoubleClick,
}: WindLidarPanelProps) {
  const divRef = useRef<HTMLDivElement>(null);

  // 建立 Plotly traces
  function buildTraces() {
    const heatmap = {
      type: 'heatmap',
      x: times,
      y: heightsKm,
      z,
      colorscale: COLORSCALE_MAP[colorscale],
      zmin,
      zmax,
      connectgaps: false,
      colorbar: {
        title: { text: unit, side: 'right' },
        thickness: 14,
        len: 0.9,
        tickfont: { size: 10 },
        tickvals: (() => {
          const step = (zmax - zmin) / 4;
          return [0, 1, 2, 3, 4].map((i) => zmin + step * i);
        })(),
        ticktext: (() => {
          const step = (zmax - zmin) / 4;
          return [0, 1, 2, 3, 4].map((i) => {
            const v = zmin + step * i;
            return parseFloat(v.toFixed(2)).toString();
          });
        })(),
      },
      hovertemplate: '時間: %{x}<br>高度: %{y:.3f} km<br>數值: %{z:.3f}<extra></extra>',
    };

    const traces: unknown[] = [heatmap];

    if (showArrows) {
      if (arrowType === 'vertical') {
        // 垂直風向：用 z（Vsp）自身畫 ↑↓ 箭頭
        traces.push(buildVerticalArrowTrace(z, times, heightsKm));
      } else if (wdirZ && wdirZ.length > 0) {
        // 水平風向：用 wdirZ 畫方向符號
        traces.push(buildArrowTrace(wdirZ, times, heightsKm));
      }
    }

    return traces;
  }

  // 建立 Plotly layout
  function buildLayout() {
    const xAxis: Record<string, unknown> = {
      title: { text: '台灣本地時間', font: { size: 11 } },
      type: 'date',
      tickfont: { size: 10 },
    };
    if (xRange) {
      xAxis.range = xRange;
    }

    return {
      height: CHART_HEIGHT,
      margin: { t: 50, b: 44, l: 60, r: 80 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(255,255,255,0.85)',
      font: { family: 'system-ui, sans-serif', size: 11 },
      title: {
        text: `<b>${title}</b>`,
        font: { size: 13, color: C.rose },
        x: 0.01,
        xanchor: 'left',
      },
      dragmode: 'zoom',
      xaxis: xAxis,
      yaxis: {
        title: { text: '高度 (km)', font: { size: 11 } },
        tickfont: { size: 10 },
        dtick: 0.1,                // 每 100 公尺一條刻度線
        tick0: 0,
        showgrid: true,
        gridcolor: 'rgba(0, 0, 0, 0.1)',
        gridwidth: 1,
      },
      modebar: {
        orientation: 'h',
        bgcolor: 'rgba(255,255,255,0.75)',
        color: C.hint ?? '#b0a0b8',
        activecolor: C.rose,
      },
    };
  }


  const PLOTLY_CONFIG = {
    displayModeBar: true,
    responsive: true,
    displaylogo: false,
    locale: 'zh-TW',
  };

  // 重繪（xRange 或資料變化時呼叫）
  const render = useCallback(async () => {
    const el = divRef.current;
    if (!el) return;
    const Plotly = await getPlotly();
    await Plotly.react(
      el,
      buildTraces() as never,
      buildLayout() as never,
      PLOTLY_CONFIG as never,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times, heightsKm, z, colorscale, zmin, zmax, unit, showArrows, arrowType, wdirZ, xRange]);

  // 初次掛載：newPlot + 綁定事件
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let mounted = true;

    (async () => {
      if (!mounted) return;
      const Plotly = await getPlotly();
      await Plotly.newPlot(
        el,
        buildTraces() as never,
        buildLayout() as never,
        PLOTLY_CONFIG as never,
      );
      if (!mounted) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).on('plotly_relayout', (event: Record<string, unknown>) => {
        onRelayout?.(event);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).on('plotly_doubleclick', () => {
        onDoubleClick?.();
      });
    })();

    return () => {
      mounted = false;
      getPlotly().then((P) => P.purge(el)).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 僅掛載時執行一次

  // 資料或 xRange 更新後重繪
  useEffect(() => {
    render();
  }, [render]);

  return (
    <div
      style={{
        background: C.glass,
        border: '1px solid rgba(212,86,122,0.08)',
        borderRadius: 16,
        boxShadow: C.glassShadow,
        padding: '4px 8px 8px',
        overflow: 'hidden',
      }}
    >
      <style jsx global>{`
        .js-plotly-plot .modebar-container {
          white-space: nowrap !important;
        }
        .js-plotly-plot .modebar-group {
          display: inline-flex !important;
        }

       .plotly-notifier {
          top: 100px !important;      
          right: 24px !important;
          max-width: 260px !important;
        }
        .plotly-notifier .notifier-note {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 1.5px solid rgba(212, 86, 122, 0.5) !important;
          color: #D4567A !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 20px rgba(180,140,160,0.25) !important;
          padding: 10px 14px !important;
          font-family: system-ui, sans-serif !important;
          font-weight: 900;
          font-size: 12px !important;
          line-height: 1.5 !important;
          margin-bottom: 12px !important;
        }
        .plotly-notifier .notifier-close {
          color: #D4567A !important;
        }
      `}</style>
      <div ref={divRef} style={{ width: '100%', minHeight: CHART_HEIGHT }} />
    </div>
  );
}