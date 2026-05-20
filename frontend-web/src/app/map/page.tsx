'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@shared/store';
import { getGrid, setScenario } from '@shared/api/index';
import { palette, semantic } from '@shared/constants/theme';
import { GridCell, Pollutant } from '@shared/types';

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), { ssr: false });
const TGOSMap = dynamic(() => import('@/components/map/TGOSMap'), { ssr: false });

export default function MapPage() {
  const { selectedPollutant, setSelectedPollutant, mode, setMode, gridCells, setGridCells, setSelectedGridId, selectedScenario, isLoading, setIsLoading } = useStore();
  const [mapMode, setMapMode] = useState<'2D' | 'Satellite'>('2D');
  const [selectedGrid, setSelectedGrid] = useState<GridCell | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setScenario(selectedScenario);
    getGrid({ pollutant: selectedPollutant })
      .then(setGridCells)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedPollutant, selectedScenario]);

  const handleGridPress = (grid: GridCell) => {
    setSelectedGrid(grid);
    setSelectedGridId(grid.gridId);
    setShowSheet(true);
  };

  const getPollutantLabel = () => ({ PM25: 'PM2.5', O3: 'O₃', NOX: 'NOₓ', VOCs: 'VOCs' }[selectedPollutant]);

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 80px)', backgroundColor: palette.bgBase, overflow: 'hidden' }}>

      {/* Top controls */}
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', backgroundColor: 'rgba(255,249,255,0.94)', borderRadius: 25, padding: 4, alignSelf: 'flex-start' }}>
          {(['NOW', 'FORECAST'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              backgroundColor: mode === m ? palette.primaryDeep : 'transparent',
              color: mode === m ? '#fff' : palette.textSecondary, fontSize: 14, fontWeight: 600,
            }}>
              {m === 'NOW' ? 'REAL-TIME' : 'FORECAST'}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 25, padding: '12px 16px', boxShadow: `0 2px 8px ${palette.shadow}20`, border: `1px solid ${palette.borderSoft}`, gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.textSecondary} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search districts or monitoring sites" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: palette.textMain }} />
          <div style={{ width: 1, height: 20, backgroundColor: palette.borderSoft }} />
          <button onClick={() => setMapMode(mapMode === '2D' ? 'Satellite' : '2D')} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: palette.primaryDeep, fontWeight: 600, fontSize: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {mapMode}
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', inset: 0, display: mode === 'FORECAST' ? 'none' : 'block' }}>
          <LeafletMap gridCells={gridCells} mapMode={mapMode} onGridPress={handleGridPress} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: mode === 'FORECAST' ? 'block' : 'none' }}>
          <TGOSMap gridCells={gridCells} onGridPress={handleGridPress} />
        </div>
      </div>

      {/* Attribution */}
      <div style={{ position: 'absolute', right: 20, bottom: 34, zIndex: 20, display: 'flex', backgroundColor: 'rgba(255,255,255,0.78)', padding: '4.5px 6px', borderRadius: 10, alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: palette.textSecondary }}>地圖來源：</span>
        <a href={mode === 'FORECAST' ? 'https://www.tgos.tw' : 'https://www.windy.com'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: palette.primaryDeep, textDecoration: 'underline' }}>
          {mode === 'FORECAST' ? 'TGOS 國土測繪圖資' : 'Windy.com'}
        </a>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', left: 20, bottom: 34, zIndex: 10 }}>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: 16, minWidth: 140, border: `1px solid ${palette.borderSoft}` }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            {(['PM25', 'O3', 'NOX', 'VOCs'] as Pollutant[]).map((p) => {
              const on = selectedPollutant === p;
              return (
                <button key={p} onClick={() => setSelectedPollutant(p)} style={{
                  width: 24, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  backgroundColor: on ? palette.primaryDeep : palette.primarySoft,
                  color: on ? '#fff' : palette.primaryDeep, fontSize: 10, fontWeight: 600,
                }}>
                  {p === 'PM25' ? 'P' : p === 'NOX' ? 'N' : p === 'VOCs' ? 'V' : 'O'}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: palette.primaryDeep, marginBottom: 12 }}>{getPollutantLabel()} (µg/m³)</p>
          <div style={{ height: 8, borderRadius: 4, marginBottom: 4, background: `linear-gradient(to right, ${palette.primarySoft}, ${palette.primaryDeep})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {['0', '50', '100+'].map(l => <span key={l} style={{ fontSize: 10, color: palette.textSecondary }}>{l}</span>)}
          </div>
        </div>
      </div>

      {/* Bottom sheet */}
      {showSheet && selectedGrid && (
        <>
          <div onClick={() => setShowSheet(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(31,23,34,0.38)', zIndex: 20 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 32px', transition: 'transform 0.3s' }}>
            <div style={{ width: 40, height: 4, backgroundColor: palette.borderSoft, borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 24, fontWeight: 'bold', color: palette.textMain, marginBottom: 4 }}>{(selectedGrid as any).district || '桃園市'}</p>
                <p style={{ fontSize: 14, color: palette.textSecondary, letterSpacing: 1 }}>GRID ID: {selectedGrid.gridId}</p>
              </div>
              <span style={{ backgroundColor: semantic.warning, padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 600, color: palette.textMain }}>中等風險</span>
            </div>
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: palette.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{getPollutantLabel()} 濃度</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 'bold', color: palette.textMain }}>{Math.round(selectedGrid.values.value)}</span>
                <span style={{ fontSize: 14, color: palette.textSecondary }}>μg/m³</span>
              </div>
            </div>
            <button onClick={() => setShowSheet(false)} style={{ width: '100%', backgroundColor: palette.primaryDeep, color: '#fff', border: 'none', borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              完整分析
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: 16, color: palette.textMain, fontWeight: 500 }}>載入地圖數據中...</p>
          </div>
        </div>
      )}
    </div>
  );
}
