export type ItemType = "app" | "bookmark";

export interface Item {
  id: number;
  type: ItemType;
  name: string;
  url: string;
  icon: string | null;
  description: string | null;
  category_id: number | null;
  sort_order: number;
  is_pinned: 0 | 1;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface Settings {
  theme: "dark" | "light";
  accent_color: string;
  greeting_name: string;
  search_engine: string;
  sabnzbd_configured: string;
  sabnzbd_url?: string;
  [key: string]: string | undefined;
}

export interface SabnzbdSlot {
  nzo_id: string;
  filename: string;
  status: string;
  percentage: number;
  mb: number;
  mbleft: number;
  timeleft: string;
  size: string;
  sizeleft: string;
  priority: string;
  cat: string;
}

export interface SabnzbdHistorySlot {
  nzo_id: string;
  name: string;
  status: string;
  size: string;
  completed: number;
  fail_message: string;
}

export interface SabnzbdSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  paused: boolean;
  speed: string;
  speedBps: number;
  kbpersec: string;
  timeleft: string;
  sizeleft: string;
  diskspace: string;
  queue: SabnzbdSlot[];
  history: SabnzbdHistorySlot[];
}

export type ArrService = "sonarr" | "radarr";

export interface MediaItem {
  id: string;
  service: ArrService;
  kind: "movie" | "episode";
  title: string;
  subtitle: string;
  overview: string;
  year: number | null;
  poster: string | null;
  addedAt: string;
  runtime: number | null;
  genres: string[];
  rating: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  link: string | null;
  quality: string | null;
}

export interface MediaSnapshot {
  configured: boolean;
  items: MediaItem[];
  errors: { service: ArrService; message: string }[];
}

export interface TeslaSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  name: string;
  state: string;
  stateSince: string | null;
  healthy: boolean;
  batteryLevel: number | null;
  usableBatteryLevel: number | null;
  chargeLimit: number | null;
  estRange: number | null;
  ratedRange: number | null;
  pluggedIn: boolean;
  charging: boolean;
  chargingState: string | null;
  chargerPower: number | null;
  chargeEnergyAdded: number | null;
  timeToFullCharge: number | null;
  scheduledChargingStart: string | null;
  tirePressures: { fl: number | null; fr: number | null; rl: number | null; rr: number | null };
  tireWarning: boolean;
  pressureUnit: string;
  odometer: number | null;
  speed: number | null;
  shiftState: string | null;
  insideTemp: number | null;
  outsideTemp: number | null;
  climateOn: boolean;
  geofence: string | null;
  latitude: number | null;
  longitude: number | null;
  locked: boolean;
  sentryMode: boolean;
  windowsOpen: boolean;
  doorsOpen: boolean;
  updateAvailable: boolean;
  version: string | null;
  lengthUnit: string;
  tempUnit: string;
}

export interface LookupResult {
  service: ArrService;
  kind: "movie" | "series";
  externalId: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  runtime: number | null;
  genres: string[];
  rating: number | null;
  network: string | null;
  status: string | null;
  existingId: number;
  link: string | null;
}

export interface AddOptions {
  rootFolders: { id: number; path: string; freeSpace: number | null }[];
  qualityProfiles: { id: number; name: string }[];
}

export interface WeatherDay {
  date: string;
  code: number;
  description: string;
  max: number | null;
  min: number | null;
  precipitationChance: number | null;
}

export interface WeatherSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  label: string;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null;
  code: number;
  description: string;
  isDay: boolean;
  sunrise: string | null;
  sunset: string | null;
  days: WeatherDay[];
  tempUnit: string;
  windUnit: string;
}

export interface GeocodeResult {
  name: string;
  country: string;
  admin1: string | null;
  latitude: number;
  longitude: number;
}

export interface PlexStream {
  key: string;
  user: string;
  title: string;
  subtitle: string;
  kind: string;
  progress: number;
  state: string;
  transcoding: boolean;
  quality: string;
  player: string;
  thumb: string | null;
  durationMs: number | null;
  viewOffsetMs: number | null;
}

export interface TautulliSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  streamCount: number;
  totalBandwidth: number | null;
  streams: PlexStream[];
}

export type HealthState = "up" | "down" | "unknown";

export interface HealthEntry {
  state: HealthState;
  status: number | null;
  latencyMs: number | null;
  checkedAt: string;
  since: string | null;
}

export interface UpcomingItem {
  id: string;
  title: string;
  subtitle: string;
  overview: string;
  airsAt: string;
  poster: string | null;
  network: string | null;
  hasFile: boolean;
  link: string | null;
}

export interface UpcomingSnapshot {
  configured: boolean;
  items: UpcomingItem[];
  error?: string;
}

export interface IndexerStatus {
  id: number;
  name: string;
  protocol: "usenet" | "torrent" | "unknown";
  enabled: boolean;
  blocked: boolean;
  disabledTill: string | null;
  failureReason: string | null;
}

export interface ProwlarrIssue {
  type: "warning" | "error";
  message: string;
}

export interface ProwlarrSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  total: number;
  enabled: number;
  healthy: number;
  indexers: IndexerStatus[];
  issues: ProwlarrIssue[];
}

export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  stack: string | null;
}

export interface PortainerSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  total: number;
  running: number;
  problem: ContainerStatus[];
}

export interface PortainerEndpoint {
  id: number;
  name: string;
  status: "up" | "down";
}

export interface HostStats {
  configured: boolean;
  reachable: boolean;
  error?: string;
  endpointName: string | null;
  cpuCores: number;
  cpuPercent: number | null;
  memTotalBytes: number;
  memUsedBytes: number | null;
  memPercent: number | null;
  diskUsedBytes: number | null;
  containerCount: number;
  runningCount: number;
}

export interface UptimeInfo {
  processUptimeSeconds: number;
  history: { at: string; fractionUp: number }[];
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface PendingCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description: string;
}

export interface AssistantTurnResult {
  status: "done" | "needs_confirmation" | "needs_login" | "not_configured" | "error";
  messages: ChatMessage[];
  pendingCalls?: PendingCall[];
  error?: string;
}
