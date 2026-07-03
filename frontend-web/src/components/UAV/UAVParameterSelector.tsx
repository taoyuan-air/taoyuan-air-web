'use client';

import {
  ALL_PARAMETER_IDS,
  CATEGORY_LABELS,
  PARAMETER_CONFIG,
  type CategoryId,
  type ParameterId,
} from './uavConfig';
import type { ParamStats } from './UAVProfileChart';

interface Props {
  selected: ParameterId[];
  onChange: (params: ParameterId[]) => void;
  /** Stats from the last successful chart fetch — used to show ranges on active buttons */
  paramStats?: Record<string, ParamStats>;
  /**
   * Set of parameter IDs confirmed to have data in the current flight.
   * null = still prefetching (show all buttons to avoid flash).
   * When provided, buttons for parameters NOT in the set are hidden.
   */
  availableParams: Set<ParameterId> | null;
}

// Parameters intentionally excluded from the selector UI
const HIDDEN_PARAMS = new Set<ParameterId>(['p']);

// Group parameters by category in display order
const CATEGORY_ORDER: CategoryId[] = ['meteorology', 'aerosol', 'gas'];

const byCategory = CATEGORY_ORDER.reduce<Record<CategoryId, ParameterId[]>>(
  (acc, cat) => {
    acc[cat] = ALL_PARAMETER_IDS.filter(
      (id) => PARAMETER_CONFIG[id].category === cat && !HIDDEN_PARAMS.has(id)
    );
    return acc;
  },
  { meteorology: [], aerosol: [], gas: [] }
);

function RangeLabel({
  paramId,
  stats,
  active,
}: {
  paramId: ParameterId;
  stats: Record<string, ParamStats> | undefined;
  active: boolean;
}) {
  if (!active || !stats) return null;
  const s = stats[paramId];
  if (!s) return null;

  const text = s.hasData
    ? `${s.min.toFixed(1)} ~ ${s.max.toFixed(1)}`
    : '無資料';

  return (
    <span
      className="uav-param-range"
      style={{ opacity: active ? 0.85 : 0 }}
      aria-label={s.hasData ? `數值範圍 ${text}` : '無資料'}
    >
      {text}
    </span>
  );
}

export function UAVParameterSelector({ selected, onChange, paramStats, availableParams }: Props) {
  function toggle(id: ParameterId) {
    if (selected.includes(id)) {
      onChange(selected.filter((p) => p !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="uav-param-selector">
      <span className="uav-param-label">顯示參數</span>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="uav-param-group">
          <span className="uav-param-category">{CATEGORY_LABELS[cat]}</span>
          {byCategory[cat].map((id) => {
            // availableParams === null means still loading → show all buttons.
            // Once loaded, hide buttons for parameters with no data.
            if (availableParams !== null && !availableParams.has(id)) return null;

            const cfg = PARAMETER_CONFIG[id];
            const active = selected.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={`uav-param-btn${active ? ' active' : ''}`}
                style={{
                  borderColor: cfg.color,
                  color: active ? '#fff' : cfg.color,
                  backgroundColor: active ? cfg.color : 'transparent',
                }}
              >
                <span className="uav-param-btn-text">
                  {cfg.label}
                  <span className="uav-param-unit">（{cfg.unit}）</span>
                </span>
                <RangeLabel paramId={id} stats={paramStats} active={active} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
