export interface UserProfile {
  id: string;
  username: string;
  email: string;
  age_range: string | null;
  gender: string | null;
  default_district: string | null;
  sensitivity: string;
  has_respiratory: boolean;
  has_elderly: boolean;     
  has_child: boolean;       
  two_factor_enabled: boolean;
  notif_pm25: boolean;
  notif_aqi: boolean;
  notif_health: boolean;
  notif_system: boolean;
  created_at: string;
  password_changed_at: string;
}
