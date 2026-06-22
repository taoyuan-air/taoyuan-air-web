'use client';

import {
  ALL_PARAMETER_IDS,
  CATEGORY_LABELS,
  PARAMETER_CONFIG,
  type CategoryId,
  type ParameterId,
} from './uavConfig';

interface Props {
  selected: ParameterId[];
  onChange: (params: ParameterId[]) => void;
}

// Group parameters by category in display order
const CATEGORY_ORDER: CategoryId[] = ['meteorology', 'aerosol', 'gas'];

const byCategory = CATEGORY_ORDER.reduce<Record<CategoryId, ParameterId[]>>(
  (acc, cat) => {
    acc[cat] = ALL_PARAMETER_IDS.filter(
      (id) => PARAMETER_CONFIG[id].category === cat
    );
    return acc;
  },
  { meteorology: [], aerosol: [], gas: [] }
);

export function UAVParameterSelector({ selected, onChange }: Props) {
  function toggle(id: ParameterId) {
    if (selected.includes(id)) {
      onChange(selected.filter((p) => p !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="uav-param-selector">
      <span className="uav-param-label">顯示參數：</span>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="uav-param-group">
          <span className="uav-param-category">{CATEGORY_LABELS[cat]}</span>
          {byCategory[cat].map((id) => {
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
                {cfg.label}
                <span className="uav-param-unit">（{cfg.unit}）</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
