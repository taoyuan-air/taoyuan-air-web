export const EPA_STATION_TO_DISTRICT: Record<string, string> = {
  中壢: "中壢區", 桃園: "桃園區", 大園: "大園區",
  觀音: "觀音區", 平鎮: "平鎮區", 龍潭: "龍潭區",
};

export const DISTRICT_STATIC_AQ: Record<string, { pm25: number; o3: number; aqi: number }> = {
  桃園區: { pm25: 20, o3: 48, aqi: 75 }, 中壢區: { pm25: 18, o3: 42, aqi: 72 },
  八德區: { pm25: 16, o3: 40, aqi: 68 }, 龜山區: { pm25: 19, o3: 44, aqi: 73 },
  蘆竹區: { pm25: 14, o3: 36, aqi: 62 }, 大園區: { pm25: 12, o3: 35, aqi: 58 },
  大溪區: { pm25: 13, o3: 37, aqi: 60 }, 平鎮區: { pm25: 16, o3: 40, aqi: 68 },
  楊梅區: { pm25: 17, o3: 41, aqi: 70 }, 龍潭區: { pm25: 15, o3: 38, aqi: 65 },
  觀音區: { pm25: 22, o3: 45, aqi: 78 }, 新屋區: { pm25: 21, o3: 43, aqi: 76 },
  復興區: { pm25: 10, o3: 32, aqi: 52 },
};

export const DISTRICT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "桃園區": { latitude: 24.9936, longitude: 121.3010 },
  "中壢區": { latitude: 24.9539, longitude: 121.2248 },
  "八德區": { latitude: 24.9440, longitude: 121.2970 },
  "龜山區": { latitude: 25.0026, longitude: 121.3540 },
  "蘆竹區": { latitude: 25.0442, longitude: 121.2918 },
  "大園區": { latitude: 25.0608, longitude: 121.2006 },
  "大溪區": { latitude: 24.8838, longitude: 121.2681 },
  "平鎮區": { latitude: 24.9530, longitude: 121.2017 },
  "楊梅區": { latitude: 24.9175, longitude: 121.1460 },
  "龍潭區": { latitude: 24.8635, longitude: 121.2168 },
  "觀音區": { latitude: 25.0354, longitude: 121.0823 },
  "新屋區": { latitude: 24.9697, longitude: 121.1063 },
  "復興區": { latitude: 24.8186, longitude: 121.3496 },
};

export const DISTRICTS = [
  "桃園區","中壢區","八德區","龜山區","蘆竹區","大園區",
  "大溪區","平鎮區","楊梅區","龍潭區","觀音區","新屋區","復興區",
];

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const findNearestDistrict = (userLat: number, userLon: number): string => {
  let nearest = "中壢區";
  let minDist = Infinity;
  for (const [district, coords] of Object.entries(DISTRICT_COORDINATES)) {
    const d = calculateDistance(userLat, userLon, coords.latitude, coords.longitude);
    if (d < minDist) { minDist = d; nearest = district; }
  }
  return nearest;
};
