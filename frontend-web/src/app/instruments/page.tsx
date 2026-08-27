'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Plane, Wind, ChevronDown, ChevronUp,
  MapPin, Hash, Layers, Activity, Cpu, Ruler, Zap, Info,
  Radio, Gauge, Thermometer, Droplets, ArrowUpDown,
  FlaskConical, Cloud, Atom, X,
} from 'lucide-react';

/* ── Design tokens ───────────────────────────────────────────── */
const C = {
  rose:       '#D4567A',
  roseAlpha:  'rgba(212,86,122,0.10)',
  roseBorder: 'rgba(212,86,122,0.28)',
  glass:      'rgba(255,255,255,0.92)',
  glassShadow:'0 4px 20px rgba(180,140,160,0.12)',
  text:       '#1a1220',
  muted:      '#7a6880',
  hint:       '#b0a0b8',
};

/* ── 型別 ────────────────────────────────────────────────────── */
interface SpecRow   { label: string; value: string; icon?: React.ReactNode }
interface ParamItem { id: string; name: string; unit: string; range: string; description: string; color: string; icon: React.ReactNode }
interface Deployment { site: string; serialNo: string; location: string; lat: string; lon: string }
interface Instrument {
  id: 'uav' | 'wind-lidar';
  name: string; nameEn: string; overview: string; purpose: string;
  centerIcon: React.ReactNode; accentColor: string;
  specs: SpecRow[]; parameters: ParamItem[];
  deployments: Deployment[]; operationPrinciple: string; advantages: string[];
}

/* ── 節點定義（5 個，沿軌道） ────────────────────────────────── */
type NodeId = 'specs' | 'params' | 'deploy' | 'advantages' | 'principle';
interface OrbitNode {
  id: NodeId;
  angleDeg: number;   // 0 = 右，順時針
  title: string;
  summary: string;
  icon: React.ReactNode;
}
// 公式：(angleDeg - 90) * PI/180，所以 angleDeg=0 → 正上方，順時針每 72°
const ORBIT_NODES: OrbitNode[] = [
  { id: 'specs',      angleDeg: 0,   title: '技術規格', summary: '飛行高度、解析度、定位精度等硬體參數', icon: <Cpu      size={16}/> },
  { id: 'params',     angleDeg: 72,  title: '量測參數', summary: '溫度、濕度、PM2.5 等多項大氣量測值',  icon: <Activity size={16}/> },
  { id: 'deploy',     angleDeg: 144, title: '部署站點', summary: '觀音站現地部署位置與儀器序號',         icon: <MapPin   size={16}/> },
  { id: 'advantages', angleDeg: 216, title: '儀器優勢', summary: '相較傳統固定站的五大核心優勢',         icon: <Zap      size={16}/> },
  { id: 'principle',  angleDeg: 288, title: '量測原理', summary: '感測器工作機制與資料採集流程說明',      icon: <Info     size={16}/> },
];

/* ─────────────────────────────────────────────────────────────
   儀器資料
───────────────────────────────────────────────────────────── */
const INSTRUMENTS: Instrument[] = [
  {
    id: 'uav', name: 'UAV 無人機大氣探測系統',
    nameEn: 'UAV Atmospheric Measurement System',
    accentColor: '#D4567A',
    overview: '採用多旋翼無人機搭載輕量化多參數大氣感測模組，執行垂直剖面飛行任務，即時採集不同高度層的大氣環境數據，協助研究人員分析邊界層結構與垂直輸送機制。',
    purpose:  '觀察大氣邊界層內污染物（PM2.5、O₃、NOₓ 等）與氣象要素（溫度、濕度、風速）的垂直梯度分布，支援空氣品質預測模型的垂直參數驗證，以及重大污染事件的立體溯源分析。',
    centerIcon: (
      <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none">
        <line x1="60" y1="18" x2="60" y2="102" stroke="#D4567A" strokeWidth="4" strokeLinecap="round"/>
        <line x1="18" y1="60" x2="102" y2="60" stroke="#D4567A" strokeWidth="4" strokeLinecap="round"/>
        {([[20,20],[100,20],[20,100],[100,100]] as [number,number][]).map(([cx,cy],i)=>(
          <g key={i}>
            <circle cx={cx} cy={cy} r="14" fill="rgba(212,86,122,0.12)" stroke="#D4567A" strokeWidth="1.5"/>
            <line x1={cx-9} y1={cy} x2={cx+9} y2={cy} stroke="#D4567A" strokeWidth="3" strokeLinecap="round"/>
            <line x1={cx} y1={cy-9} x2={cx} y2={cy+9} stroke="#D4567A" strokeWidth="3" strokeLinecap="round"/>
          </g>
        ))}
        <rect x="47" y="47" width="26" height="26" rx="7" fill="rgba(212,86,122,0.18)" stroke="#D4567A" strokeWidth="2"/>
        <circle cx="60" cy="60" r="5" fill="#D4567A"/>
        <path d="M69 51 Q80 60 69 69" stroke="#D4567A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M73 47 Q88 60 73 73" stroke="#D4567A" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
    specs: [
      { label:'儀器類型',     value:'多旋翼 UAV + 整合式大氣感測酬載',        icon:<Cpu size={13}/> },
      { label:'最大飛行高度', value:'約 1,500 m AGL（視法規與氣象條件）',     icon:<Ruler size={13}/> },
      { label:'垂直解析度',   value:'約 1 m（後處理插值可達 5 m）',           icon:<Layers size={13}/> },
      { label:'採樣頻率',     value:'1 Hz（部分感測器 0.5 Hz）',              icon:<Activity size={13}/> },
      { label:'飛行模式',     value:'自動垂直剖面（上升 / 下降）',             icon:<ArrowUpDown size={13}/> },
      { label:'定位系統',     value:'RTK GNSS（水平 ±2 cm，垂直 ±3 cm）',    icon:<MapPin size={13}/> },
      { label:'通訊',         value:'地面站即時遙測，900 MHz / 2.4 GHz',     icon:<Zap size={13}/> },
      { label:'酬載重量',     value:'感測模組 ≤ 800 g',                      icon:<Ruler size={13}/> },
    ],
    parameters: [
      { id:'t',     name:'氣溫',    unit:'°C',    range:'-20 ~ 60',   color:'#e74c3c', icon:<Thermometer size={14}/>, description:'大氣溫度，用於分析溫度垂直遞減率與逆溫層結構。' },
      { id:'rh',    name:'相對濕度',unit:'%',     range:'0 ~ 100',    color:'#3498db', icon:<Droplets size={14}/>,    description:'空氣中水蒸氣含量，反映大氣穩定度與凝結高度。' },
      { id:'p',     name:'氣壓',    unit:'hPa',   range:'300 ~ 1100', color:'#9b59b6', icon:<Gauge size={14}/>,       description:'大氣壓力，可換算高度並校正各感測器讀值。' },
      { id:'ws',    name:'風速',    unit:'m/s',   range:'0 ~ 30',     color:'#2ecc71', icon:<Wind size={14}/>,        description:'水平合成風速，反映各高度層的動力輸送能力。' },
      { id:'wd',    name:'風向',    unit:'°',     range:'0 ~ 360',    color:'#1abc9c', icon:<ArrowUpDown size={14}/>, description:'風的來向，用於判斷污染物輸送路徑。' },
      { id:'theta', name:'位溫',    unit:'K',     range:'250 ~ 320',  color:'#e67e22', icon:<Thermometer size={14}/>, description:'消除高度對溫度影響的守恆量，用於判斷大氣層結穩定度。' },
      { id:'pm1',   name:'PM1',     unit:'μg/m³', range:'0 ~ 500',    color:'#f39c12', icon:<Cloud size={14}/>,       description:'粒徑 ≤ 1 μm 的細懸浮微粒，可深入肺泡，危害健康。' },
      { id:'PM2.5', name:'PM2.5',   unit:'μg/m³', range:'0 ~ 500',    color:'#e67e22', icon:<Cloud size={14}/>,       description:'粒徑 ≤ 2.5 μm 的細懸浮微粒，為空品標準核心指標。' },
      { id:'pm10',  name:'PM10',    unit:'μg/m³', range:'0 ~ 500',    color:'#d35400', icon:<Cloud size={14}/>,       description:'粒徑 ≤ 10 μm 的懸浮微粒，主要來自揚塵與工業排放。' },
      { id:'o3',    name:'臭氧',    unit:'ppb',   range:'0 ~ 300',    color:'#27ae60', icon:<FlaskConical size={14}/>,description:'光化學反應生成的二次污染物，高濃度時危害呼吸系統。' },
      { id:'no2',   name:'NO₂',     unit:'ppb',   range:'0 ~ 200',    color:'#c0392b', icon:<FlaskConical size={14}/>,description:'燃燒排放的一次污染物，參與光化學反應生成臭氧。' },
      { id:'so2',   name:'SO₂',     unit:'ppb',   range:'0 ~ 200',    color:'#8e44ad', icon:<FlaskConical size={14}/>,description:'主要來自工業燃煤與重油燃燒，為酸雨前驅物。' },
      { id:'co',    name:'CO',      unit:'ppm',   range:'0 ~ 50',     color:'#795548', icon:<Atom size={14}/>,        description:'不完全燃燒產物，高濃度環境下影響血液氧氣輸送。' },
      { id:'co2',   name:'CO₂',     unit:'ppm',   range:'300 ~ 5000', color:'#607d8b', icon:<Atom size={14}/>,        description:'主要溫室氣體，亦可作為燃燒源的示蹤氣體。' },
    ],
    deployments: [{ site:'觀音站', serialNo:'—', location:'桃園市觀音區', lat:'25.023°N', lon:'121.341°E' }],
    operationPrinciple: 'UAV 搭載的感測酬載整合電化學感測器（CO、NO₂、SO₂、O₃）、光散射粒子計數器（PM1/PM2.5/PM10）、電容式溫濕度感測器與 MEMS 氣壓計。飛行時以自動駕駛模式執行垂直往返剖面，資料透過機載記錄器以 1 Hz 同步儲存，搭配 RTK GNSS 精確記錄三維座標，完成後傳輸至地面站進行品管與可視化分析。',
    advantages: [
      '可量測固定地面站無法取得的立體垂直分布資料',
      '機動性高，可依需求快速部署至不同測站或污染事件現場',
      'RTK GNSS 定位精度優於 5 cm，確保資料的高度精準性',
      '多參數同步量測，單次飛行即可獲取完整大氣剖面',
      '資料可直接輸入擴散模式進行邊界條件設定',
    ],
  },
  {
    id: 'wind-lidar', name: '都卜勒風光達',
    nameEn: 'Doppler Wind LiDAR  ·  L02240328',
    accentColor: '#5B8AD4',
    overview: '地基式掃描型都卜勒風光達，儀器序號 L02240328，部署於觀音站 TMA_328。可連續自動量測地表至數百公尺高空的風速、風向及大氣亂流廓線資料，全日 24 小時輸出，不需高空飛行即可掌握邊界層動態風場結構。',
    purpose:  '提供高時間解析度（10 分鐘平均）的垂直風場廓線，用於分析大氣邊界層高度、亂流特性與污染物垂直擴散能力，並作為 UAV 飛行前的風況評估依據，以及空氣品質數值模式的邊界層風場驗證資料。',
    centerIcon: (
      <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none">
        <rect x="42" y="96" width="36" height="8" rx="4" fill="rgba(91,138,212,0.18)" stroke="#5B8AD4" strokeWidth="1.5"/>
        <rect x="52" y="62" width="16" height="35" rx="4" fill="rgba(91,138,212,0.15)" stroke="#5B8AD4" strokeWidth="1.5"/>
        <ellipse cx="60" cy="58" rx="14" ry="8" fill="rgba(91,138,212,0.22)" stroke="#5B8AD4" strokeWidth="2"/>
        <circle cx="60" cy="54" r="3" fill="#5B8AD4"/>
        {([-35,-18,0,18,35] as number[]).map((angle,i)=>{
          const rad=(angle-90)*Math.PI/180;
          return <line key={i} x1="60" y1="54" x2={60+Math.cos(rad)*38} y2={54+Math.sin(rad)*38}
            stroke="#5B8AD4" strokeWidth="1.2" strokeDasharray="4 3" opacity={i===2?1:0.45} strokeLinecap="round"/>;
        })}
        {([28,38,48] as number[]).map((r,i)=>(
          <path key={i} d={`M ${60-r} 54 A ${r} ${r} 0 0 1 ${60+r} 54`}
            stroke="#5B8AD4" strokeWidth="1" fill="none" opacity={0.25+i*0.15} strokeLinecap="round"/>
        ))}
        {([20,30,40,50] as number[]).map((y,i)=>(
          <g key={i}>
            <line x1="96" y1={y} x2="100" y2={y} stroke="#5B8AD4" strokeWidth="1" opacity="0.5"/>
            <text x="103" y={y+3.5} fontSize="7" fill="#5B8AD4" opacity="0.6">{(4-i)*0.5}km</text>
          </g>
        ))}
        <line x1="98" y1="16" x2="98" y2="55" stroke="#5B8AD4" strokeWidth="1" opacity="0.35"/>
      </svg>
    ),
    specs: [
      { label:'儀器序號',     value:'L02240328',                           icon:<Hash size={13}/> },
      { label:'儀器類型',     value:'地基式都卜勒相干光偵測風光達',          icon:<Cpu size={13}/> },
      { label:'雷射波長',     value:'1.5 μm（人眼安全，Class 1）',          icon:<Zap size={13}/> },
      { label:'量測高度範圍', value:'40 m ~ 3,000 m AGL',                  icon:<Ruler size={13}/> },
      { label:'垂直解析度',   value:'20 m（gate length）',                 icon:<Layers size={13}/> },
      { label:'時間解析度',   value:'10 分鐘均值廓線',                      icon:<Activity size={13}/> },
      { label:'掃描模式',     value:'DBS（Doppler Beam Swinging）/ VAD',   icon:<Radio size={13}/> },
      { label:'量測精度',     value:'風速 ±0.1 m/s，風向 ±2°',            icon:<Gauge size={13}/> },
    ],
    parameters: [
      { id:'wind_speed',     name:'水平風速 (Hsp)', unit:'m/s', range:'0 ~ 30',   color:'#3498db', icon:<Wind size={14}/>,        description:'各高度層的水平合成風速，反映動力輸送能力與大氣邊界層結構。' },
      { id:'wind_direction', name:'風向 (Wdir)',     unit:'°',   range:'0 ~ 360', color:'#1abc9c', icon:<ArrowUpDown size={14}/>, description:'水平風的來向，用於污染物輸送路徑分析與源受體關係研究。' },
      { id:'turbulence',     name:'亂流強度 (Turb)', unit:'—',   range:'0 ~ 1',   color:'#e67e22', icon:<Activity size={14}/>,    description:'亂流動能（TKE）無因次化指標，反映大氣混合能力，值越高混合越強。' },
      { id:'cnr',            name:'訊號強度 (CNR)',  unit:'dB',  range:'0 ~ 10',  color:'#9b59b6', icon:<Radio size={14}/>,       description:'回波訊雜比（CNR），反映大氣氣膠濃度及光達量測品質。' },
    ],
    deployments: [{ site:'觀音站 TMA_328', serialNo:'L02240328', location:'桃園市觀音區', lat:'25.023°N', lon:'121.341°E' }],
    operationPrinciple: '儀器向大氣發射脈衝雷射光束，光子與大氣中的氣膠粒子發生米氏散射後返回接收器。由於氣膠隨大氣移動，返回光相較發射光產生都卜勒頻移，儀器計算此頻移量即可反演各高度層的風速分量。以 DBS 模式向多個方位角傾斜發射後，合成計算出水平風速與風向；亂流強度則由速度方差估算得出。',
    advantages: [
      '非接觸式主動遙測，不受惡劣天氣影響（除濃霧外）',
      '連續自動觀測，全日 24 小時輸出廓線資料',
      '垂直解析度 20 m，可精確解析混合層高度與低空急流',
      '1.5 μm 雷射屬人眼安全波段，符合無人機共域飛行安全需求',
      '可作為無人機飛行前風況評估的即時依據',
    ],
  },
];

/* ─────────────────────────────────────────────────────────────
   浮層內容
───────────────────────────────────────────────────────────── */
function PopoverContent({
  nodeId, ins, accent,
}: { nodeId: NodeId; ins: Instrument; accent: string }) {
  const [expandedParam, setExpandedParam] = useState<string | null>(null);
  const [showAllSpecs, setShowAllSpecs]   = useState(false);

  if (nodeId === 'specs') {
    const visible = showAllSpecs ? ins.specs : ins.specs.slice(0, 4);
    return (
      <div>
        {visible.map(s => (
          <div key={s.label} className="pop-spec-row">
            <span className="pop-spec-icon" style={{ color: accent }}>{s.icon}</span>
            <div>
              <div className="pop-spec-label">{s.label}</div>
              <div className="pop-spec-value">{s.value}</div>
            </div>
          </div>
        ))}
        {ins.specs.length > 4 && (
          <button className="pop-expand-btn" onClick={() => setShowAllSpecs(p => !p)}
            style={{ color: accent }}>
            {showAllSpecs
              ? <><ChevronUp size={12}/> 收合</>
              : <><ChevronDown size={12}/> 顯示全部 {ins.specs.length} 項</>}
          </button>
        )}
      </div>
    );
  }

  if (nodeId === 'params') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {ins.parameters.map(p => {
          const open = expandedParam === p.id;
          return (
            <button key={p.id}
              onClick={() => setExpandedParam(open ? null : p.id)}
              className={`pop-param-btn${open ? ' pop-param-btn--open' : ''}`}
              style={{ '--ac': accent } as React.CSSProperties}>
              <div className="pop-param-row">
                <div className="pop-param-dot" style={{ background: p.color }}/>
                <span style={{ color: p.color, display:'flex', alignItems:'center' }}>{p.icon}</span>
                <span className="pop-param-name">{p.name}</span>
                <span className="pop-param-unit">{p.unit}</span>
                <span style={{ color: C.hint, display:'flex', alignItems:'center' }}>
                  {open ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                </span>
              </div>
              {open && (
                <div className="pop-param-detail">
                  <div className="pop-param-range">量測範圍：{p.range} {p.unit}</div>
                  <div className="pop-param-desc">{p.description}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (nodeId === 'deploy') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {ins.deployments.map(d => (
          <div key={d.serialNo} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
            {([
              { label:'站點名稱', value:d.site },
              { label:'儀器序號', value:d.serialNo },
              { label:'行政位置', value:d.location },
              { label:'座標',     value:`${d.lat}  ${d.lon}` },
            ]).map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize:10, fontWeight:700, color:C.hint, marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{value}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (nodeId === 'advantages') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {ins.advantages.map((adv, i) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
            <div style={{
              width:19, height:19, borderRadius:'50%', flexShrink:0,
              background: `${accent}18`, border:`1px solid ${accent}44`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:10, fontWeight:800, color:accent,
            }}>{i+1}</div>
            <span style={{ fontSize:12.5, color:C.muted, lineHeight:1.6 }}>{adv}</span>
          </div>
        ))}
      </div>
    );
  }

  if (nodeId === 'principle') {
    return (
      <p style={{ margin:0, fontSize:12.5, color:C.muted, lineHeight:1.85 }}>
        {ins.operationPrinciple}
      </p>
    );
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────
   軌道節點元件（桌面用）
   
   設計原則：
   - 容器固定 900×900px，中心 (450,450)
   - 軌道半徑 300px，節點按鈕 90px
   - 浮層從節點往「遠離中心」方向打開，
     translateX/Y 由角度決定，確保不擋中心圖示
───────────────────────────────────────────────────────────── */
const SCENE    = 750;          // 容器邊長（px）
const CX       = SCENE / 2;   // 450 中心
const ORBIT_R  = 300;         // 軌道半徑
const NODE_D   = 90;          // 節點直徑
const NODE_R   = NODE_D / 2;  // 45
const POP_W    = 360;         // 浮層寬度
const POP_GAP  = NODE_R + 14; // 節點邊緣到浮層起點距離

/** 根據節點角度算出浮層的 transform，往外側推 */
function popoverTransform(angleDeg: number): string {
  const rad = (angleDeg - 90) * Math.PI / 180;
  // 外側方向的單位向量
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  // 水平：右側 → 左邊緣對齊節點右側；左側 → 右邊緣對齊節點左側
  const toRight = ux >= 0;
  // 垂直：下方 → 上緣對齊；上方 → 下緣對齊；中間 → 垂直居中
  const absMidY = Math.abs(uy);

  let tx: number;
  let ty: number;

  if (toRight) {
    // 浮層左邊緣 = 節點右邊緣 + gap
    tx = POP_GAP;
  } else {
    // 浮層右邊緣 = 節點左邊緣 - gap  →  left = -(POP_W + POP_GAP)
    tx = -(POP_W + POP_GAP);
  }

  if (absMidY < 0.3) {
    // 幾乎純水平（左右）：垂直居中
    ty = -200; // 約浮層高度一半
  } else if (uy > 0) {
    // 節點偏下方 → 浮層往上展（底部對齊節點中心）
    ty = -380;
  } else {
    // 節點偏上方 → 浮層往下展（頂部對齊節點中心）
    ty = 0;
  }

  return `translate(${tx}px, ${ty}px)`;
}

function OrbitScene({
  ins, accent, openId, setOpenId,
}: {
  ins: Instrument; accent: string;
  openId: NodeId | null; setOpenId: (id: NodeId | null) => void;
}) {
  const sceneRef   = useRef<HTMLDivElement>(null);

  // 點外部關閉
  useEffect(() => {
    if (!openId) return;
    const handler = (e: MouseEvent) => {
      if (sceneRef.current && !sceneRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openId, setOpenId]);

  return (
    /* 外層置中容器，overflow visible 讓浮層可超出 */
    <div style={{ display:'flex', justifyContent:'center', marginTop:40, overflow:'visible' }}>
      <div ref={sceneRef}
        style={{
          position:'relative',
          width: SCENE, height: SCENE,
          flexShrink: 0,
          userSelect:'none',
          overflow:'visible',
        }}>

        {/* ── 軌道圓 + 連線（SVG 底層） ── */}
        <svg style={{ position:'absolute', inset:0, width:SCENE, height:SCENE, pointerEvents:'none', overflow:'visible' }}>
          {/* 外環裝飾 */}
          <circle cx={CX} cy={CX} r={ORBIT_R + 28}
            fill="none" stroke="rgba(212,86,122,0.05)" strokeWidth="1"/>
          {/* 主軌道 */}
          <circle cx={CX} cy={CX} r={ORBIT_R}
            fill="none"
            stroke="rgba(212,86,122,0.18)"
            strokeWidth="1.5"
            strokeDasharray="7 5"
          />
          {/* 中心 → 各節點的連線 */}
          {ORBIT_NODES.map(n => {
            const rad = (n.angleDeg - 90) * Math.PI / 180;
            const nx  = CX + Math.cos(rad) * ORBIT_R;
            const ny  = CX + Math.sin(rad) * ORBIT_R;
            const isOpen = openId === n.id;
            return (
              <line key={n.id}
                x1={CX} y1={CX} x2={nx} y2={ny}
                stroke={isOpen ? accent : 'rgba(212,86,122,0.10)'}
                strokeWidth={isOpen ? 2 : 1}
                strokeDasharray={isOpen ? 'none' : '4 4'}
                style={{ transition:'stroke 0.2s, stroke-width 0.2s' }}
              />
            );
          })}
        </svg>

        {/* ── 中央儀器圖示 ── */}
        <div style={{
          position:'absolute',
          left: CX, top: CX,
          transform: 'translate(-50%, -50%)',
          width: 200, height: 200,
          borderRadius: 32,
          background: 'rgba(255,255,255,0.88)',
          border: `2px solid ${accent}44`,
          boxShadow: `0 0 0 16px ${accent}08, 0 8px 40px rgba(180,140,160,0.20)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
          overflow: 'hidden',
        }}>
          <div style={{ width:164, height:164 }}>{ins.centerIcon}</div>
          <div style={{
            position:'absolute', bottom:10, left:0, right:0,
            textAlign:'center', fontSize:10, fontWeight:700, color:accent, opacity:0.50,
          }}>（老師提供圖片替換）</div>
        </div>

        {/* ── 各節點 ── */}
        {ORBIT_NODES.map(n => {
          const rad    = (n.angleDeg - 90) * Math.PI / 180;
          const nx     = CX + Math.cos(rad) * ORBIT_R;
          const ny     = CX + Math.sin(rad) * ORBIT_R;
          const isOpen = openId === n.id;

          return (
            <div key={n.id}
              style={{
                position:'absolute',
                left: nx, top: ny,
                transform: 'translate(-50%, -50%)',
                zIndex: isOpen ? 30 : 5,
              }}>

              {/* 節點按鈕 */}
              <button
                onClick={() => setOpenId(isOpen ? null : n.id)}
                aria-expanded={isOpen}
                className={`orbit-node${isOpen ? ' orbit-node--open' : ''}`}
                style={{ '--ac': accent } as React.CSSProperties}
              >
                <span className="orbit-node-icon">{n.icon}</span>
                <span className="orbit-node-title">{n.title}</span>
              </button>

              {/* 浮層：往節點外側方向打開 */}
              {isOpen && (
                <div
                  className="orbit-popover"
                  style={{
                    position:'absolute',
                    top: 0, left: 0,
                    transform: popoverTransform(n.angleDeg),
                    '--ac': accent,
                  } as React.CSSProperties}
                >
                  <div className="orbit-popover-header">
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ color: accent, display:'flex' }}>{n.icon}</span>
                      <span className="orbit-popover-title">{n.title}</span>
                    </div>
                    <button onClick={() => setOpenId(null)} className="orbit-popover-close">
                      <X size={13}/>
                    </button>
                  </div>
                  <div className="orbit-popover-body">
                    <PopoverContent nodeId={n.id} ins={ins} accent={accent}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   手機版：垂直卡片
───────────────────────────────────────────────────────────── */
function MobileSection({ nodeId, ins, accent }: { nodeId: NodeId; ins: Instrument; accent: string }) {
  const [open, setOpen]           = useState(false);
  const [expandedParam, setEP]    = useState<string | null>(null);
  const [showAllSpecs, setSAS]    = useState(false);

  const node = ORBIT_NODES.find(n => n.id === nodeId)!;

  return (
    <div className="mobile-section">
      <button className="mobile-section-header" onClick={() => setOpen(o => !o)}
        style={{ '--ac': accent } as React.CSSProperties}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className="mobile-section-icon" style={{ background:`${accent}18`, color:accent, border:`1px solid ${accent}33` }}>
            {node.icon}
          </div>
          <div style={{ textAlign:'left' }}>
            <div className="mobile-section-title">{node.title}</div>
            <div className="mobile-section-summary">{node.summary}</div>
          </div>
        </div>
        {open ? <ChevronUp size={16} color={C.hint}/> : <ChevronDown size={16} color={C.hint}/>}
      </button>
      {open && (
        <div className="mobile-section-body">
          <PopoverContent nodeId={nodeId} ins={ins} accent={accent}/>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab 列
───────────────────────────────────────────────────────────── */
function TabBar({ active, onChange }: { active: 'uav' | 'wind-lidar'; onChange: (v: 'uav' | 'wind-lidar') => void }) {
  const tabs = [
    { id: 'uav'        as const, label: 'UAV 無人機',        icon: <Plane size={15} strokeWidth={2}/> },
    { id: 'wind-lidar' as const, label: 'Wind Lidar 風光達', icon: <Wind  size={15} strokeWidth={2}/> },
  ];
  return (
    <div style={{ display:'flex', gap:8, padding:6, background:'rgba(255,255,255,0.70)',
      borderRadius:999, border:`1px solid ${C.roseBorder}`, boxShadow:C.glassShadow, width:'fit-content' }}>
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-pressed={on}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 20px', borderRadius:999,
              border:'none', cursor:'pointer', fontSize:13, fontWeight: on?800:600,
              color: on?'#fff':C.muted, background: on?C.rose:'transparent',
              boxShadow: on?`0 2px 10px ${C.rose}4D`:'none', transition:'all 0.18s' }}>
            {t.icon}{t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   主頁面
───────────────────────────────────────────────────────────── */
export default function InstrumentsPage() {
  const [tab, setTab]       = useState<'uav' | 'wind-lidar'>('uav');
  const [openId, setOpenId] = useState<NodeId | null>(null);

  const ins    = INSTRUMENTS.find(i => i.id === tab)!;
  const accent = ins.accentColor;

  return (
    <div style={{ minHeight:'100vh', background:'var(--app-bg-gradient)', paddingBottom:80 }}>

      {/* Tab */}
      <div style={{ padding:'40px 0 8px 36px' }}>
        <TabBar active={tab} onChange={v => { setTab(v); setOpenId(null); }}/>
      </div>

      {/* ── 頂部橫幅 ── */}
      <div className="inst-banner">
        <div className="inst-banner-left">
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
              background:C.roseAlpha, border:`1px solid ${C.roseBorder}`,
              display:'flex', alignItems:'center', justifyContent:'center', color:C.rose }}>
              {tab==='uav' ? <Plane size={18} strokeWidth={2}/> : <Wind size={18} strokeWidth={2}/>}
            </div>
            <div>
              <h1 style={{ margin:0, fontSize:18, fontWeight:900, color:C.rose, lineHeight:1.2 }}>{ins.name}</h1>
              <p  style={{ margin:0, fontSize:11, color:C.hint }}>{ins.nameEn}</p>
            </div>
          </div>
          <p style={{ margin:0, fontSize:13, color:C.muted, lineHeight:1.75 }}>{ins.overview}</p>
        </div>
        <div className="inst-banner-right" style={{ '--ac': accent } as React.CSSProperties}>
          <div style={{ fontSize:11, fontWeight:800, color:accent, letterSpacing:'0.4px', marginBottom:8 }}>觀測目的</div>
          <p style={{ margin:0, fontSize:13, color:C.muted, lineHeight:1.75 }}>{ins.purpose}</p>
        </div>
      </div>

      {/* ── 桌面版：軌道場景 ── */}
      <div className="inst-orbit-wrapper">
        <OrbitScene ins={ins} accent={accent} openId={openId} setOpenId={setOpenId}/>
      </div>

      {/* ── 手機版：垂直卡片 ── */}
      <div className="inst-mobile-list">
        {/* 儀器圖示 */}
        <div style={{ display:'flex', justifyContent:'center', margin:'8px 0 20px' }}>
          <div style={{ width:140, height:140, borderRadius:24, background:'rgba(255,255,255,0.80)',
            border:`2px solid ${accent}44`, boxShadow:`0 4px 24px rgba(180,140,160,0.16)`,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width:110, height:110 }}>{ins.centerIcon}</div>
          </div>
        </div>
        {ORBIT_NODES.map(n => (
          <MobileSection key={n.id} nodeId={n.id} ins={ins} accent={accent}/>
        ))}
      </div>

      {/* ── Styles ── */}
      <style>{`
        /* Banner */
        .inst-banner {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 24px 40px 0;
        }
        .inst-banner-left {
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: ${C.glassShadow};
        }
        .inst-banner-right {
          background: ${C.roseAlpha};
          border: 1px solid var(--ac, ${C.roseBorder});
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: ${C.glassShadow};
        }

        /* Orbit */
        .inst-orbit-wrapper {
          display: block;
          overflow: visible;
          margin: 0 auto;
        }
        .inst-mobile-list { display: none; }

        /* 軌道節點按鈕 */
        .orbit-node {
          width: ${NODE_D}px;
          height: ${NODE_D}px;
          border-radius: 50%;
          border: 2px solid rgba(212,86,122,0.22);
          background: rgba(255,255,255,0.88);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          box-shadow: 0 2px 14px rgba(180,140,160,0.16);
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.18s;
          outline: none;
          font-family: inherit;
          padding: 0;
        }
        .orbit-node:hover {
          border-color: var(--ac);
          background: rgba(255,255,255,0.97);
          transform: scale(1.08);
        }
        .orbit-node--open {
          border-color: var(--ac) !important;
          border-width: 2.5px;
          background: rgba(255,255,255,0.98);
          box-shadow:
            0 0 0 6px color-mix(in srgb, var(--ac) 14%, transparent),
            0 6px 28px rgba(180,140,160,0.22);
          transform: scale(1.12);
          animation: node-pop 0.24s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes node-pop {
          0%   { transform: scale(0.86); }
          100% { transform: scale(1.12); }
        }
        .orbit-node-icon {
          display: flex; align-items: center;
          color: ${C.muted};
          transition: color 0.2s;
        }
        .orbit-node--open .orbit-node-icon,
        .orbit-node:hover .orbit-node-icon { color: var(--ac); }
        .orbit-node-title {
          font-size: 11px; font-weight: 800;
          color: ${C.muted};
          text-align: center; line-height: 1.2;
          letter-spacing: 0.2px;
          transition: color 0.2s;
        }
        .orbit-node--open .orbit-node-title,
        .orbit-node:hover .orbit-node-title { color: var(--ac); }

        /* 浮層 */
        .orbit-popover {
          position: absolute;
          width: ${POP_W}px;
          max-height: 520px;
          overflow-y: auto;
          background: rgba(255,255,255,0.97);
          border: 2px solid var(--ac);
          border-radius: 18px;
          box-shadow:
            0 0 0 5px color-mix(in srgb, var(--ac) 10%, transparent),
            0 16px 48px rgba(130,80,110,0.20);
          z-index: 40;
          animation: pop-in 0.24s cubic-bezier(0.34,1.4,0.64,1);
        }
        @keyframes pop-in {
          0%   { opacity:0; scale: 0.88; }
          100% { opacity:1; scale: 1; }
        }
        .orbit-popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px 10px;
          border-bottom: 1px solid rgba(180,140,160,0.12);
          position: sticky;
          top: 0;
          background: rgba(255,255,255,0.97);
          border-radius: 16px 16px 0 0;
          z-index: 1;
        }
        .orbit-popover-title {
          font-size: 14px; font-weight: 800;
          color: ${C.text};
        }
        .orbit-popover-close {
          width: 24px; height: 24px; border-radius: 6px;
          border: 1px solid rgba(180,140,160,0.20);
          background: rgba(0,0,0,0.03);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: ${C.hint};
          transition: background 0.15s, color 0.15s;
        }
        .orbit-popover-close:hover { background: rgba(212,86,122,0.08); color: ${C.rose}; }
        .orbit-popover-body {
          padding: 12px 14px 14px;
        }

        /* 規格列 */
        .pop-spec-row {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 9px 0;
          border-bottom: 1px solid rgba(180,140,160,0.08);
        }
        .pop-spec-icon { display:flex; align-items:center; flex-shrink:0; margin-top:2px; }
        .pop-spec-label { font-size:10px; font-weight:700; color:${C.hint}; margin-bottom:2px; }
        .pop-spec-value { font-size:13px; font-weight:600; color:${C.text}; }
        .pop-expand-btn {
          margin-top: 8px;
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700;
          background: none; border: none; cursor: pointer;
          padding: 4px 2px;
          font-family: inherit;
          opacity: 0.85;
          transition: opacity 0.15s;
        }
        .pop-expand-btn:hover { opacity: 1; }

        /* 參數按鈕（浮層內）*/
        .pop-param-btn {
          width: 100%; text-align: left;
          background: rgba(255,255,255,0.60);
          border: 1.5px solid rgba(180,140,160,0.15);
          border-radius: 8px;
          padding: 8px 10px;
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
          outline: none;
        }
        .pop-param-btn:hover { border-color: rgba(212,86,122,0.28); }
        .pop-param-btn--open {
          border-color: var(--ac) !important;
          border-width: 2px;
          background: rgba(255,255,255,0.95);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--ac) 10%, transparent);
          animation: card-pop 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes card-pop {
          0%   { transform: scale(0.97); }
          100% { transform: scale(1); }
        }
        .pop-param-row { display:flex; align-items:center; gap:7px; }
        .pop-param-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .pop-param-name { flex:1; font-size:12.5px; font-weight:700; color:${C.text}; }
        .pop-param-unit {
          font-size:10.5px; font-weight:700; color:${C.rose};
          background:${C.roseAlpha}; border:1px solid ${C.roseBorder};
          border-radius:5px; padding:1.5px 6px; flex-shrink:0;
        }
        .pop-param-detail { margin-top:7px; padding-top:7px; border-top:1px solid rgba(180,140,160,0.10); }
        .pop-param-range { font-size:10.5px; color:${C.hint}; font-weight:600; margin-bottom:3px; }
        .pop-param-desc  { font-size:12px; color:${C.muted}; line-height:1.6; }

        /* 手機版卡片 */
        .mobile-section {
          background: rgba(255,255,255,0.90);
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: ${C.glassShadow};
        }
        .mobile-section-header {
          width:100%; display:flex; align-items:center; justify-content:space-between;
          padding:14px 16px; border:none; background:transparent; cursor:pointer;
          font-family:inherit;
        }
        .mobile-section-icon {
          width:34px; height:34px; border-radius:9px; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
        }
        .mobile-section-title {
          font-size:14px; font-weight:800; color:${C.text}; margin-bottom:2px;
        }
        .mobile-section-summary {
          font-size:11.5px; color:${C.hint}; font-weight:500;
        }
        .mobile-section-body {
          padding:0 16px 16px;
          border-top:1px solid rgba(180,140,160,0.10);
          padding-top:14px;
          animation: fade-in 0.2s ease;
        }
        @keyframes fade-in {
          from { opacity:0; transform:translateY(-4px); }
          to   { opacity:1; transform:translateY(0); }
        }

        /* RWD */
        @media (max-width: 768px) {
          .inst-banner {
            grid-template-columns: 1fr;
            margin: 16px 20px 0;
          }
          .inst-orbit-wrapper { display: none; }
          .inst-mobile-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 20px 20px 0;
          }
        }
      `}</style>
    </div>
  );
}
