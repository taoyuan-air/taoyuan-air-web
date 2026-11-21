export interface UserProfile {
  id: string;
  username: string;
  email: string;
  birth_date: Date | null;
  gender: string | null;
  default_district: string | null;
  sensitivity: string;
  /** @deprecated 已停用,不再蒐集;後端於第三份文件移除 */
  has_respiratory?: boolean;
  /** @deprecated 已停用,不再蒐集;後端於第三份文件移除 */
  has_elderly?: boolean;
  /** @deprecated 已停用,不再蒐集;後端於第三份文件移除 */
  has_child?: boolean;
  two_factor_enabled: boolean;
  notif_pm25: boolean;
  notif_aqi: boolean;
  notif_health: boolean;
  notif_system: boolean;
  created_at: string;
  password_changed_at: string;
}
