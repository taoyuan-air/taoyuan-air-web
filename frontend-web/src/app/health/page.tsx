'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useMoeCurrent, findStationData } from '@/lib/health/useMoeCurrent';
import { useStationHistory, filterByStation } from '@/lib/health/useStationHistory';
import {
  DISTRICTS,
  referenceStationFor,
  type District,
} from '@/lib/health/districtStations';
import { CurrentAqiCard } from '@/components/health/CurrentAqiCard';
import { AqiScrubber } from '@/components/health/AqiScrubber';
import { StandardsComparison } from '@/components/health/StandardsComparison';
import { Pm25DayChart } from '@/components/health/Pm25DayChart';
import { PollutantGuide } from '@/components/health/PollutantGuide';
import { OfficialLinks } from '@/components/health/OfficialLinks';
import { Disclaimer } from '@/components/health/Disclaimer';

export default function HealthPage() {
  const { user } = useAuth();
  const moe = useMoeCurrent();
  const history = useStationHistory();

  const [isMobile, setIsMobile] = useState(false);
  const [district, setDistrict] = useState<District>('桃園區');

  // 預設行政區 = user.default_district;未設定則「桃園區」並提示可至設定頁儲存
  useEffect(() => {
    const apply = () => {
      if (user?.default_district && DISTRICTS.includes(user.default_district as District)) {
        setDistrict(user.default_district as District);
      }
    };
    apply();
  }, [user?.default_district]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const refStation = useMemo(() => referenceStationFor(district), [district]);
  const stationData = useMemo(() => findStationData(moe.data, refStation), [moe.data, refStation]);
  const stationHistory = useMemo(
    () => filterByStation(history.records, refStation),
    [history.records, refStation],
  );
  const sensitivity = user?.sensitivity ?? '一般民眾';
  const showStoreHint = !user?.default_district;

  const pad = isMobile ? '0 16px 80px' : '0 40px 32px';
  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: 20,
    alignItems: 'start',
  };

  return (
    <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* M2 我的測站現況 + 官方活動建議(跨整列) */}
      <CurrentAqiCard
        district={district}
        onDistrictChange={setDistrict}
        refStation={refStation}
        showStoreHint={showStoreHint}
        station={stationData}
        isFallback={moe.isFallback}
        loading={moe.loading}
        sensitivity={sensitivity}
        refetch={moe.refetch}
      />

      {/* M1 AQI 級距互動尺 | M3 標準比對 */}
      <div style={twoCol}>
        <AqiScrubber currentAqi={stationData?.aqi} sensitivity={sensitivity} />
        <StandardsComparison historyRecords={stationHistory} station={stationData} />
      </div>

      {/* M4 近 24 小時 PM2.5(跨整列) */}
      <Pm25DayChart historyRecords={stationHistory} />

      {/* M5 污染物小百科 | M6/M7 官方連結 + 通知捷徑 */}
      <div style={twoCol}>
        <PollutantGuide />
        <OfficialLinks />
      </div>

      {/* 免責聲明完整版 + 官方出處列表(跨整列) */}
      <div style={{ maxWidth: isMobile ? '100%' : 760 }}>
        <Disclaimer variant="full" />
      </div>
    </div>
  );
}
