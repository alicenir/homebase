import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import type { GeocodeResult } from "../types";

const ACCENTS = ["#7c5cff", "#22c55e", "#f97316", "#ef4444", "#06b6d4", "#ec4899"];
const TABS = ["General", "Appearance", "Weather", "Downloads", "Media", "Indexers", "Plex", "Docker", "Car", "Assistant", "NAS", "Categories", "Security"] as const;

type TabName = (typeof TABS)[number];

export function SettingsPanel({
  open,
  onClose,
  initialTab,
  onRequestLogin,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: TabName;
  onRequestLogin?: () => void;
}) {
  const authed = useStore((s) => s.authed);
  const hasPassword = useStore((s) => s.hasPassword);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const categories = useStore((s) => s.categories);
  const upsertCategory = useStore((s) => s.upsertCategory);
  const removeCategory = useStore((s) => s.removeCategory);

  const [tab, setTab] = useState<TabName>("General");
  const [greeting, setGreeting] = useState("");
  const [searchEngine, setSearchEngine] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [accent, setAccent] = useState("#7c5cff");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [sabUrl, setSabUrl] = useState("");
  const [sabKey, setSabKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [arr, setArr] = useState({
    sonarr_url: "",
    sonarr_api_key: "",
    radarr_url: "",
    radarr_api_key: "",
  });
  const [testingArr, setTestingArr] = useState<"sonarr" | "radarr" | null>(null);
  const [tmdbApiKey, setTmdbApiKey] = useState("");
  const [testingTmdb, setTestingTmdb] = useState(false);
  const [tesla, setTesla] = useState({ url: "", token: "", carId: "1" });
  const [plex, setPlex] = useState({ url: "", apiKey: "" });
  const [prowlarr, setProwlarr] = useState({ url: "", apiKey: "" });
  const [testingProwlarr, setTestingProwlarr] = useState(false);
  const [portainer, setPortainer] = useState({ url: "", apiKey: "", endpointId: "1" });
  const [testingPortainer, setTestingPortainer] = useState(false);
  const [endpoints, setEndpoints] = useState<{ id: number; name: string; status: string }[]>([]);
  const [testingPlex, setTestingPlex] = useState(false);
  const [assistant, setAssistant] = useState({
    provider: "" as "" | "ollama" | "anthropic" | "openai",
    ollamaUrl: "",
    ollamaModel: "",
    anthropicApiKey: "",
    anthropicModel: "",
    openaiApiKey: "",
    openaiModel: "",
  });
  const [testingAssistant, setTestingAssistant] = useState(false);
  const [nas, setNas] = useState({
    host: "",
    port: "161",
    version: "3",
    community: "",
    username: "",
    authProtocol: "sha",
    authKey: "",
    privProtocol: "aes",
    privKey: "",
  });
  const [nasSeparatePriv, setNasSeparatePriv] = useState(false);
  const [nasAdvanced, setNasAdvanced] = useState(false);
  const [testingNas, setTestingNas] = useState(false);
  const [nasWalk, setNasWalk] = useState<{ oid: string; type: string; value: string }[] | null>(null);
  const [walkingNas, setWalkingNas] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<GeocodeResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [testingTesla, setTestingTesla] = useState(false);
  const [teslaCars, setTeslaCars] = useState<{ id: number; name: string }[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (open && initialTab) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!settings) return;
    setGreeting(settings.greeting_name ?? "");
    setSearchEngine(settings.search_engine ?? "");
    setTheme((settings.theme as "dark" | "light") ?? "dark");
    setAccent(settings.accent_color ?? "#7c5cff");
    setBackgroundImageUrl(settings.background_image_url ?? "");
    setSabUrl(settings.sabnzbd_url ?? "");
    setPlex({ url: settings.tautulli_url ?? "", apiKey: "" });
    setProwlarr({ url: settings.prowlarr_url ?? "", apiKey: "" });
    setPortainer({
      url: settings.portainer_url ?? "",
      apiKey: "",
      endpointId: settings.portainer_endpoint_id ?? "1",
    });
    setPlaceQuery(settings.weather_label ?? "");
    setTesla({
      url: settings.teslamate_url ?? "",
      token: "",
      carId: settings.teslamate_car_id ?? "1",
    });
    setArr({
      sonarr_url: settings.sonarr_url ?? "",
      sonarr_api_key: "",
      radarr_url: settings.radarr_url ?? "",
      radarr_api_key: "",
    });
    setTmdbApiKey("");
    setAssistant({
      provider: (settings.assistant_provider as "" | "ollama" | "anthropic" | "openai") ?? "",
      ollamaUrl: settings.assistant_ollama_url ?? "",
      ollamaModel: settings.assistant_ollama_model ?? "",
      anthropicApiKey: "",
      anthropicModel: settings.assistant_anthropic_model ?? "",
      openaiApiKey: "",
      openaiModel: settings.assistant_openai_model ?? "",
    });
    setNas({
      host: settings.nas_snmp_host ?? "",
      port: settings.nas_snmp_port ?? "161",
      version: settings.nas_snmp_version ?? "3",
      community: "",
      username: settings.nas_snmp_username ?? "",
      authProtocol: settings.nas_snmp_auth_protocol ?? "sha",
      authKey: "",
      privProtocol: settings.nas_snmp_priv_protocol ?? "aes",
      privKey: "",
    });
  }, [settings, open]);

  async function saveGeneral() {
    await api.put("/settings", { greeting_name: greeting, search_engine: searchEngine });
    setSettings({ ...settings!, greeting_name: greeting, search_engine: searchEngine });
    toast.success("Saved");
  }

  async function saveAppearance(nextTheme = theme, nextAccent = accent) {
    await api.put("/settings", { theme: nextTheme, accent_color: nextAccent });
    setSettings({ ...settings!, theme: nextTheme, accent_color: nextAccent });
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.style.setProperty("--accent", nextAccent);
  }

  async function saveBackgroundImage() {
    const url = backgroundImageUrl.trim();
    await api.put("/settings", { background_image_url: url });
    setSettings({ ...settings!, background_image_url: url });
    toast.success(url ? "Background image saved" : "Background image cleared");
  }

  async function testSabnzbd() {
    if (!sabUrl || !sabKey) return toast.error("Enter URL and API key");
    setTesting(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string; version?: string }>(
        "/settings/sabnzbd/test",
        { url: sabUrl, apiKey: sabKey }
      );
      if (result.ok) toast.success(`Connected (SABnzbd ${result.version ?? ""})`);
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function saveSabnzbd() {
    await api.put("/settings", { sabnzbd_url: sabUrl, sabnzbd_api_key: sabKey });
    setSettings({ ...settings!, sabnzbd_url: sabUrl, sabnzbd_configured: String(Boolean(sabUrl && sabKey)) });
    setSabKey("");
    toast.success("SABnzbd connection saved");
  }

  async function testArr(service: "sonarr" | "radarr") {
    const url = arr[`${service}_url`];
    const apiKey = arr[`${service}_api_key`];
    if (!url || !apiKey) return toast.error("Enter URL and API key");
    setTestingArr(service);
    try {
      const result = await api.post<{ ok: boolean; error?: string; version?: string }>(
        "/settings/arr/test",
        { service, url, apiKey }
      );
      if (result.ok) toast.success(`Connected (v${result.version ?? "?"})`);
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingArr(null);
    }
  }

  async function saveArr(service: "sonarr" | "radarr") {
    const url = arr[`${service}_url`];
    const apiKey = arr[`${service}_api_key`];
    const payload: Record<string, string> = { [`${service}_url`]: url };
    // An empty key field means "leave the stored key alone".
    if (apiKey) payload[`${service}_api_key`] = apiKey;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      [`${service}_url`]: url,
      [`${service}_configured`]: String(Boolean(url && (apiKey || settings![`${service}_configured`] === "true"))),
    });
    setArr((a) => ({ ...a, [`${service}_api_key`]: "" }));
    toast.success(`${service === "sonarr" ? "Sonarr" : "Radarr"} saved`);
  }

  async function testTmdb() {
    if (!tmdbApiKey) return toast.error("Enter an API key");
    setTestingTmdb(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string }>("/settings/tmdb/test", {
        apiKey: tmdbApiKey,
      });
      if (result.ok) toast.success("Connected");
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingTmdb(false);
    }
  }

  async function saveTmdb() {
    if (!tmdbApiKey) return toast.error("Enter an API key");
    await api.put("/settings", { tmdb_api_key: tmdbApiKey });
    setSettings({ ...settings!, tmdb_configured: "true" });
    setTmdbApiKey("");
    toast.success("TMDB saved");
  }

  async function searchPlaces() {
    if (placeQuery.trim().length < 2) return toast.error("Type at least two characters");
    setSearchingPlace(true);
    try {
      const data = await api.get<{ results: GeocodeResult[] }>(
        `/weather/search?q=${encodeURIComponent(placeQuery.trim())}`
      );
      setPlaces(data.results);
      if (data.results.length === 0) toast("No matching places");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setSearchingPlace(false);
    }
  }

  async function usePlace(place: GeocodeResult) {
    const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    await api.put("/settings", {
      weather_latitude: String(place.latitude),
      weather_longitude: String(place.longitude),
      weather_label: place.name,
    });
    setSettings({
      ...settings!,
      weather_latitude: String(place.latitude),
      weather_longitude: String(place.longitude),
      weather_label: place.name,
      weather_configured: "true",
    });
    setPlaces([]);
    setPlaceQuery(place.name);
    toast.success(`Weather set to ${label}`);
  }

  async function saveWeatherUnits(units: "metric" | "imperial") {
    await api.put("/settings", { weather_units: units });
    setSettings({ ...settings!, weather_units: units });
  }

  async function testProwlarr() {
    if (!prowlarr.url || !prowlarr.apiKey) return toast.error("Enter URL and API key");
    setTestingProwlarr(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string; version?: string }>(
        "/settings/prowlarr/test",
        { url: prowlarr.url, apiKey: prowlarr.apiKey }
      );
      if (result.ok) toast.success(`Connected (Prowlarr ${result.version ?? ""})`);
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingProwlarr(false);
    }
  }

  async function saveProwlarr() {
    const payload: Record<string, string> = { prowlarr_url: prowlarr.url };
    if (prowlarr.apiKey) payload.prowlarr_api_key = prowlarr.apiKey;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      prowlarr_url: prowlarr.url,
      prowlarr_configured: String(
        Boolean(prowlarr.url && (prowlarr.apiKey || settings!.prowlarr_configured === "true"))
      ),
    });
    setProwlarr((s) => ({ ...s, apiKey: "" }));
    toast.success("Prowlarr saved");
  }

  async function testPortainer() {
    if (!portainer.url || !portainer.apiKey) return toast.error("Enter URL and API key");
    setTestingPortainer(true);
    try {
      const result = await api.post<{
        ok: boolean;
        error?: string;
        endpoints?: { id: number; name: string; status: string }[];
      }>("/portainer/endpoints", { url: portainer.url, apiKey: portainer.apiKey });
      if (!result.ok) {
        toast.error(result.error ?? "Connection failed");
      } else {
        setEndpoints(result.endpoints ?? []);
        if (result.endpoints?.length && !result.endpoints.some((e) => String(e.id) === portainer.endpointId)) {
          setPortainer((s) => ({ ...s, endpointId: String(result.endpoints![0].id) }));
        }
        toast.success(`Found ${result.endpoints?.length ?? 0} environment(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingPortainer(false);
    }
  }

  async function savePortainer() {
    const payload: Record<string, string> = {
      portainer_url: portainer.url,
      portainer_endpoint_id: portainer.endpointId || "1",
    };
    if (portainer.apiKey) payload.portainer_api_key = portainer.apiKey;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      portainer_url: portainer.url,
      portainer_endpoint_id: portainer.endpointId || "1",
      portainer_configured: String(
        Boolean(portainer.url && (portainer.apiKey || settings!.portainer_configured === "true"))
      ),
    });
    setPortainer((s) => ({ ...s, apiKey: "" }));
    toast.success("Portainer saved");
  }

  function assistantPayload() {
    return {
      provider: assistant.provider,
      ollamaUrl: assistant.ollamaUrl,
      ollamaModel: assistant.ollamaModel,
      anthropicApiKey: assistant.anthropicApiKey,
      anthropicModel: assistant.anthropicModel,
      openaiApiKey: assistant.openaiApiKey,
      openaiModel: assistant.openaiModel,
    };
  }

  async function testAssistant() {
    if (!assistant.provider) return toast.error("Choose a provider first");
    setTestingAssistant(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string; reply?: string }>(
        "/settings/assistant/test",
        assistantPayload()
      );
      if (result.ok) toast.success(`Connected — replied "${result.reply}"`);
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingAssistant(false);
    }
  }

  async function saveAssistant() {
    const payload: Record<string, string> = {
      assistant_provider: assistant.provider,
      assistant_ollama_url: assistant.ollamaUrl,
      assistant_ollama_model: assistant.ollamaModel,
      assistant_anthropic_model: assistant.anthropicModel,
      assistant_openai_model: assistant.openaiModel,
    };
    if (assistant.anthropicApiKey) payload.assistant_anthropic_api_key = assistant.anthropicApiKey;
    if (assistant.openaiApiKey) payload.assistant_openai_api_key = assistant.openaiApiKey;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      assistant_provider: assistant.provider,
      assistant_ollama_url: assistant.ollamaUrl,
      assistant_ollama_model: assistant.ollamaModel,
      assistant_anthropic_model: assistant.anthropicModel,
      assistant_openai_model: assistant.openaiModel,
      assistant_configured: String(Boolean(assistant.provider)),
    });
    setAssistant((s) => ({ ...s, anthropicApiKey: "", openaiApiKey: "" }));
    toast.success("Assistant saved");
  }

  function nasIsV3() {
    return nas.version === "3";
  }

  function nasPayload() {
    if (!nasIsV3()) {
      return { host: nas.host, port: nas.port, version: nas.version, community: nas.community };
    }
    return {
      host: nas.host,
      port: nas.port,
      version: nas.version,
      username: nas.username,
      authProtocol: nas.authProtocol,
      authKey: nas.authKey,
      privProtocol: nas.privProtocol,
      privKey: nasSeparatePriv ? nas.privKey : nas.authKey,
    };
  }

  async function testNas() {
    if (!nas.host) return toast.error("Enter a host");
    if (nasIsV3()) {
      if (!nas.username || !nas.authKey || (nasSeparatePriv && !nas.privKey)) {
        return toast.error("Enter username and password");
      }
    } else if (!nas.community) {
      return toast.error("Enter a community string");
    }
    setTestingNas(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string; sysDescr?: string }>(
        "/settings/nas/test",
        nasPayload()
      );
      if (result.ok) toast.success(result.sysDescr ? `Connected — ${result.sysDescr}` : "Connected");
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingNas(false);
    }
  }

  async function saveNas() {
    const payload: Record<string, string> = {
      nas_snmp_host: nas.host,
      nas_snmp_port: nas.port,
      nas_snmp_version: nas.version,
    };
    let configured = Boolean(nas.host);
    if (nasIsV3()) {
      payload.nas_snmp_username = nas.username;
      payload.nas_snmp_auth_protocol = nas.authProtocol;
      payload.nas_snmp_priv_protocol = nas.privProtocol;
      if (nas.authKey) payload.nas_snmp_auth_key = nas.authKey;
      const privKey = nasSeparatePriv ? nas.privKey : nas.authKey;
      if (privKey) payload.nas_snmp_priv_key = privKey;
      configured = configured && Boolean(nas.username && (nas.authKey || settings!.nas_configured === "true"));
    } else {
      if (nas.community) payload.nas_snmp_community = nas.community;
      configured = configured && Boolean(nas.community || settings!.nas_configured === "true");
    }
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      nas_snmp_host: nas.host,
      nas_snmp_port: nas.port,
      nas_snmp_version: nas.version,
      nas_snmp_username: nas.username,
      nas_snmp_auth_protocol: nas.authProtocol,
      nas_snmp_priv_protocol: nas.privProtocol,
      nas_configured: String(configured),
    });
    setNas((s) => ({ ...s, authKey: "", privKey: "", community: "" }));
    toast.success("NAS saved");
  }

  async function runNasWalk() {
    setWalkingNas(true);
    setNasWalk(null);
    try {
      const result = await api.post<{ ok: boolean; error?: string; entries?: typeof nasWalk }>(
        "/nas/walk",
        {}
      );
      if (result.ok) setNasWalk(result.entries ?? []);
      else toast.error(result.error ?? "Walk failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Walk failed");
    } finally {
      setWalkingNas(false);
    }
  }

  async function testPlex() {
    if (!plex.url || !plex.apiKey) return toast.error("Enter URL and API key");
    setTestingPlex(true);
    try {
      const result = await api.post<{ ok: boolean; error?: string; name?: string }>(
        "/settings/tautulli/test",
        { url: plex.url, apiKey: plex.apiKey }
      );
      if (result.ok) toast.success(`Connected to ${result.name ?? "Plex"}`);
      else toast.error(result.error ?? "Connection failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingPlex(false);
    }
  }

  async function savePlex() {
    const payload: Record<string, string> = { tautulli_url: plex.url };
    if (plex.apiKey) payload.tautulli_api_key = plex.apiKey;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      tautulli_url: plex.url,
      tautulli_configured: String(Boolean(plex.url && (plex.apiKey || settings!.tautulli_configured === "true"))),
    });
    setPlex((s) => ({ ...s, apiKey: "" }));
    toast.success("Tautulli saved");
  }

  async function testTesla() {
    if (!tesla.url) return toast.error("Enter the TeslaMateApi URL");
    setTestingTesla(true);
    try {
      const result = await api.post<{
        ok: boolean;
        error?: string;
        warning?: string;
        cars?: { id: number; name: string }[];
      }>("/settings/teslamate/test", { url: tesla.url, token: tesla.token });
      if (!result.ok) {
        toast.error(result.error ?? "Connection failed");
      } else if (result.warning) {
        toast(result.warning);
      } else {
        setTeslaCars(result.cars ?? []);
        toast.success(`Found ${result.cars?.length ?? 0} car(s)`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTestingTesla(false);
    }
  }

  async function saveTesla() {
    const payload: Record<string, string> = {
      teslamate_url: tesla.url,
      teslamate_car_id: tesla.carId || "1",
    };
    if (tesla.token) payload.teslamate_api_token = tesla.token;
    await api.put("/settings", payload);
    setSettings({
      ...settings!,
      teslamate_url: tesla.url,
      teslamate_car_id: tesla.carId || "1",
      teslamate_configured: String(Boolean(tesla.url)),
    });
    setTesla((s) => ({ ...s, token: "" }));
    toast.success("TeslaMate saved");
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    const { id } = await api.post<{ id: number }>("/categories", {
      name: newCategory.trim(),
      sort_order: categories.length,
    });
    upsertCategory({ id, name: newCategory.trim(), sort_order: categories.length });
    setNewCategory("");
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category? Bookmarks inside it will become uncategorized.")) return;
    await api.delete(`/categories/${id}`);
    removeCategory(id);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 4) return toast.error("Password must be at least 4 characters");
    try {
      await api.post("/auth/set-password", { currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    }
  }

  if (!settings) return null;

  const locked = hasPassword && !authed;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex w-full max-w-2xl overflow-hidden rounded-2xl"
            style={{ maxHeight: "80vh" }}
          >
            {locked ? (
              <div className="flex w-full flex-col items-start gap-3 p-6">
                <h2 className="text-lg font-semibold text-ink">Sign in to change settings</h2>
                <p className="max-w-sm text-sm text-ink-muted">
                  This dashboard is password protected, and this browser isn't signed in yet.
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onRequestLogin?.();
                    }}
                    className="btn-primary"
                  >
                    Sign in
                  </button>
                  <button onClick={onClose} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="w-40 shrink-0 hairline border-r p-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    tab === t ? "bg-accent/20 text-accent" : "text-ink-muted hover:sunken hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              {tab === "General" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">General</h2>
                  <label className="text-sm text-ink-muted">
                    Greeting name
                    <input
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      placeholder="e.g. Nir"
                      className="field mt-1"
                    />
                  </label>
                  <label className="text-sm text-ink-muted">
                    Web search engine (use %s for the query)
                    <input
                      value={searchEngine}
                      onChange={(e) => setSearchEngine(e.target.value)}
                      className="field mt-1"
                    />
                  </label>
                  <button
                    onClick={saveGeneral}
                    className="btn-primary ml-auto"
                  >
                    Save
                  </button>
                </div>
              )}

              {tab === "Appearance" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">Appearance</h2>
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">Theme</p>
                    <div className="flex gap-2">
                      {(["dark", "light"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setTheme(t);
                            saveAppearance(t, accent);
                          }}
                          className={`rounded-xl border px-4 py-2 text-sm capitalize ${
                            theme === t ? "border-accent text-accent" : "hairline text-ink-muted"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">Accent color</p>
                    <div className="flex gap-2">
                      {ACCENTS.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setAccent(c);
                            saveAppearance(theme, c);
                          }}
                          style={{ background: c }}
                          className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-surface ${
                            accent === c ? "ring-2 ring-white" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-ink-muted">
                      Background photo <span className="text-ink-muted/60">(optional)</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={backgroundImageUrl}
                        onChange={(e) => setBackgroundImageUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveBackgroundImage()}
                        placeholder="https://example.com/your-photo.jpg"
                        className="field flex-1"
                      />
                      <button onClick={saveBackgroundImage} className="btn-primary shrink-0">
                        Save
                      </button>
                    </div>
                    {backgroundImageUrl.trim() && (
                      <div className="mt-3 h-28 w-full overflow-hidden rounded-xl sunken-strong">
                        <img
                          src={backgroundImageUrl.trim()}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <p className="mt-2 text-xs text-ink-muted">
                      A link to any image — shown full-bleed behind the dashboard, dimmed so cards
                      stay readable. Leave blank to keep the plain background.
                    </p>
                  </div>
                </div>
              )}

              {tab === "Weather" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Weather</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Powered by Open-Meteo — no API key or account needed. Search for your city and
                      pick it; the coordinates are stored, not the name.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchPlaces()}
                      placeholder="e.g. Tel Aviv"
                      className="field flex-1"
                    />
                    <button
                      onClick={searchPlaces}
                      disabled={searchingPlace}
                      className="btn-outline disabled:opacity-50"
                    >
                      {searchingPlace ? "Searching…" : "Search"}
                    </button>
                  </div>

                  {places.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {places.map((p) => (
                        <li key={`${p.latitude},${p.longitude}`}>
                          <button
                            onClick={() => usePlace(p)}
                            className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink transition-colors hover-sunken"
                          >
                            {p.name}
                            <span className="ml-2 text-xs text-ink-muted">
                              {[p.admin1, p.country].filter(Boolean).join(", ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {settings.weather_configured === "true" && (
                    <p className="text-xs text-ink-muted">
                      Currently showing <span className="font-semibold text-ink">{settings.weather_label}</span>{" "}
                      ({Number(settings.weather_latitude).toFixed(2)},{" "}
                      {Number(settings.weather_longitude).toFixed(2)})
                    </p>
                  )}

                  <div>
                    <p className="mb-2 text-sm text-ink-muted">Units</p>
                    <div className="flex gap-2">
                      {(["metric", "imperial"] as const).map((u) => (
                        <button
                          key={u}
                          onClick={() => saveWeatherUnits(u)}
                          className={`rounded-xl border px-4 py-2 text-sm capitalize ${
                            (settings.weather_units ?? "metric") === u
                              ? "border-accent text-accent"
                              : "hairline text-ink-muted"
                          }`}
                        >
                          {u === "metric" ? "°C · km/h" : "°F · mph"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "Plex" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Plex activity</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Connect Tautulli to show what is streaming right now — who, what, how far in,
                      and whether it is transcoding.
                    </p>
                  </div>
                  <label className="text-sm text-ink-muted">
                    Tautulli URL
                    <input
                      value={plex.url}
                      onChange={(e) => setPlex((s) => ({ ...s, url: e.target.value }))}
                      placeholder="http://tautulli.local:8181"
                      className="field mt-1"
                    />
                  </label>
                  <label className="text-sm text-ink-muted">
                    API key (Tautulli → Settings → Web Interface)
                    <input
                      type="password"
                      value={plex.apiKey}
                      onChange={(e) => setPlex((s) => ({ ...s, apiKey: e.target.value }))}
                      placeholder={
                        settings.tautulli_configured === "true" ? "•••••••• (unchanged)" : "API key"
                      }
                      className="field mt-1"
                    />
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button onClick={testPlex} disabled={testingPlex} className="btn-outline disabled:opacity-50">
                      {testingPlex ? "Testing…" : "Test"}
                    </button>
                    <button onClick={savePlex} className="btn-primary">
                      Save
                    </button>
                  </div>
                </div>
              )}

              {tab === "Indexers" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Indexers</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Connect Prowlarr to show which indexers are currently blocked or failing.
                    </p>
                  </div>
                  <label className="text-sm text-ink-muted">
                    Prowlarr URL
                    <input
                      value={prowlarr.url}
                      onChange={(e) => setProwlarr((s) => ({ ...s, url: e.target.value }))}
                      placeholder="http://prowlarr.local:9696"
                      className="field mt-1"
                    />
                  </label>
                  <label className="text-sm text-ink-muted">
                    API key (Prowlarr → Settings → General)
                    <input
                      type="password"
                      value={prowlarr.apiKey}
                      onChange={(e) => setProwlarr((s) => ({ ...s, apiKey: e.target.value }))}
                      placeholder={
                        settings.prowlarr_configured === "true" ? "•••••••• (unchanged)" : "API key"
                      }
                      className="field mt-1"
                    />
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={testProwlarr}
                      disabled={testingProwlarr}
                      className="btn-outline disabled:opacity-50"
                    >
                      {testingProwlarr ? "Testing…" : "Test"}
                    </button>
                    <button onClick={saveProwlarr} className="btn-primary">
                      Save
                    </button>
                  </div>
                </div>
              )}

              {tab === "Docker" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Docker (via Portainer)</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Shows live container status by reading Portainer's Docker proxy — no direct
                      access to the host is needed. Create an API token under your Portainer user
                      settings → Access tokens.
                    </p>
                  </div>
                  <label className="text-sm text-ink-muted">
                    Portainer URL
                    <input
                      value={portainer.url}
                      onChange={(e) => setPortainer((s) => ({ ...s, url: e.target.value }))}
                      placeholder="http://portainer.local:9000"
                      className="field mt-1"
                    />
                  </label>
                  <label className="text-sm text-ink-muted">
                    API token
                    <input
                      type="password"
                      value={portainer.apiKey}
                      onChange={(e) => setPortainer((s) => ({ ...s, apiKey: e.target.value }))}
                      placeholder={
                        settings.portainer_configured === "true" ? "•••••••• (unchanged)" : "Access token"
                      }
                      className="field mt-1"
                    />
                  </label>

                  <label className="text-sm text-ink-muted">
                    Environment
                    {endpoints.length > 0 ? (
                      <select
                        value={portainer.endpointId}
                        onChange={(e) => setPortainer((s) => ({ ...s, endpointId: e.target.value }))}
                        className="field mt-1"
                      >
                        {endpoints.map((e) => (
                          <option key={e.id} value={String(e.id)}>
                            {e.name} (id {e.id}) {e.status === "down" ? "— unreachable" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={portainer.endpointId}
                        onChange={(e) => setPortainer((s) => ({ ...s, endpointId: e.target.value }))}
                        placeholder="1"
                        className="field mt-1"
                      />
                    )}
                  </label>

                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={testPortainer}
                      disabled={testingPortainer}
                      className="btn-outline disabled:opacity-50"
                    >
                      {testingPortainer ? "Testing…" : "Test & list environments"}
                    </button>
                    <button onClick={savePortainer} className="btn-primary">
                      Save
                    </button>
                  </div>
                </div>
              )}

              {tab === "Downloads" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">SABnzbd</h2>
                  <p className="text-sm text-ink-muted">
                    Connect SABnzbd to show live download progress on the dashboard.
                  </p>
                  <label className="text-sm text-ink-muted">
                    Server URL
                    <input
                      value={sabUrl}
                      onChange={(e) => setSabUrl(e.target.value)}
                      placeholder="http://sabnzbd.local:8080"
                      className="field mt-1"
                    />
                  </label>
                  <label className="text-sm text-ink-muted">
                    API key
                    <input
                      type="password"
                      value={sabKey}
                      onChange={(e) => setSabKey(e.target.value)}
                      placeholder={settings.sabnzbd_configured === "true" ? "•••••••• (unchanged)" : "Found in SABnzbd → Config → General"}
                      className="field mt-1"
                    />
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={testSabnzbd}
                      disabled={testing}
                      className="btn-outline disabled:opacity-50"
                    >
                      {testing ? "Testing…" : "Test connection"}
                    </button>
                    <button
                      onClick={saveSabnzbd}
                      className="btn-primary"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {tab === "Media" && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold">Media libraries</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Connect Sonarr and Radarr to show recently downloaded episodes and movies,
                      with posters and descriptions pulled from your own instances.
                    </p>
                  </div>

                  {(["sonarr", "radarr"] as const).map((service) => (
                    <div key={service} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-ink">
                          {service === "sonarr" ? "Sonarr" : "Radarr"}
                        </h3>
                        {settings[`${service}_configured`] === "true" && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            Connected
                          </span>
                        )}
                      </div>
                      <input
                        value={arr[`${service}_url`]}
                        onChange={(e) => setArr((a) => ({ ...a, [`${service}_url`]: e.target.value }))}
                        placeholder={`http://${service}.local:${service === "sonarr" ? "8989" : "7878"}`}
                        className="field"
                      />
                      <input
                        type="password"
                        value={arr[`${service}_api_key`]}
                        onChange={(e) =>
                          setArr((a) => ({ ...a, [`${service}_api_key`]: e.target.value }))
                        }
                        placeholder={
                          settings[`${service}_configured`] === "true"
                            ? "•••••••• (unchanged)"
                            : "API key — Settings → General in " + service
                        }
                        className="field"
                      />
                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={() => testArr(service)}
                          disabled={testingArr === service}
                          className="btn-outline disabled:opacity-50"
                        >
                          {testingArr === service ? "Testing…" : "Test"}
                        </button>
                        <button onClick={() => saveArr(service)} className="btn-primary">
                          Save
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="hairline flex flex-col gap-2 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-ink">TMDB</h3>
                      {settings?.tmdb_configured === "true" && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted">
                      Optional — lets the AI assistant answer "what's trending" questions with
                      today's or this week's popular movies/shows.{" "}
                      <a
                        href="https://www.themoviedb.org/settings/api"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Get a free API key
                      </a>
                      .
                    </p>
                    <input
                      type="password"
                      value={tmdbApiKey}
                      onChange={(e) => setTmdbApiKey(e.target.value)}
                      placeholder={settings?.tmdb_configured === "true" ? "•••••••• (unchanged)" : "API key"}
                      className="field"
                    />
                    <div className="ml-auto flex gap-2">
                      <button onClick={testTmdb} disabled={testingTmdb} className="btn-outline disabled:opacity-50">
                        {testingTmdb ? "Testing…" : "Test"}
                      </button>
                      <button onClick={saveTmdb} className="btn-primary">
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tab === "Car" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">TeslaMate</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Point this at your{" "}
                      <span className="font-medium text-ink">TeslaMateApi</span> instance (the REST
                      API that runs alongside TeslaMate, usually on port 8080) to show battery,
                      range and charging state on the dashboard.
                    </p>
                  </div>

                  <label className="text-sm text-ink-muted">
                    TeslaMateApi URL
                    <input
                      value={tesla.url}
                      onChange={(e) => setTesla((s) => ({ ...s, url: e.target.value }))}
                      placeholder="http://192.168.1.10:8080"
                      className="field mt-1"
                    />
                  </label>

                  <label className="text-sm text-ink-muted">
                    API token (only if API_TOKEN_DISABLE is false)
                    <input
                      type="password"
                      value={tesla.token}
                      onChange={(e) => setTesla((s) => ({ ...s, token: e.target.value }))}
                      placeholder={
                        settings.teslamate_configured === "true"
                          ? "•••••••• (unchanged)"
                          : "Leave blank if your API needs no token"
                      }
                      className="field mt-1"
                    />
                  </label>

                  <label className="text-sm text-ink-muted">
                    Car
                    {teslaCars.length > 0 ? (
                      <select
                        value={tesla.carId}
                        onChange={(e) => setTesla((s) => ({ ...s, carId: e.target.value }))}
                        className="field mt-1"
                      >
                        {teslaCars.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name} (id {c.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={tesla.carId}
                        onChange={(e) => setTesla((s) => ({ ...s, carId: e.target.value }))}
                        placeholder="1"
                        className="field mt-1"
                      />
                    )}
                  </label>

                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={testTesla}
                      disabled={testingTesla}
                      className="btn-outline disabled:opacity-50"
                    >
                      {testingTesla ? "Testing…" : "Test & list cars"}
                    </button>
                    <button onClick={saveTesla} className="btn-primary">
                      Save
                    </button>
                  </div>
                </div>
              )}

              {tab === "Assistant" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">Assistant</h2>
                  <p className="text-sm text-ink-muted">
                    Powers the "Ask anything" bar. It can read your downloads, media, indexers,
                    containers, car and weather live, and — only with your approval — add media or
                    change the download queue.
                  </p>

                  <div>
                    <p className="mb-2 text-sm text-ink-muted">Provider</p>
                    <div className="flex gap-2">
                      {(["ollama", "anthropic", "openai"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setAssistant((s) => ({ ...s, provider: p }))}
                          className={`flex-1 rounded-lg py-1.5 text-sm capitalize transition-colors ${
                            assistant.provider === p
                              ? "bg-accent text-white"
                              : "sunken text-ink-muted hover:text-ink"
                          }`}
                        >
                          {p === "ollama" ? "Ollama (local)" : p === "anthropic" ? "Claude" : "OpenAI"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {assistant.provider === "ollama" && (
                    <>
                      <label className="text-sm text-ink-muted">
                        Ollama URL
                        <input
                          value={assistant.ollamaUrl}
                          onChange={(e) => setAssistant((s) => ({ ...s, ollamaUrl: e.target.value }))}
                          placeholder="http://ollama.local:11434"
                          className="field mt-1"
                        />
                      </label>
                      <label className="text-sm text-ink-muted">
                        Model
                        <input
                          value={assistant.ollamaModel}
                          onChange={(e) => setAssistant((s) => ({ ...s, ollamaModel: e.target.value }))}
                          placeholder="llama3.1"
                          className="field mt-1"
                        />
                      </label>
                    </>
                  )}

                  {assistant.provider === "anthropic" && (
                    <>
                      <label className="text-sm text-ink-muted">
                        Anthropic API key
                        <input
                          type="password"
                          value={assistant.anthropicApiKey}
                          onChange={(e) => setAssistant((s) => ({ ...s, anthropicApiKey: e.target.value }))}
                          placeholder={settings?.assistant_configured === "true" ? "•••• (unchanged)" : "sk-ant-…"}
                          className="field mt-1"
                        />
                      </label>
                      <label className="text-sm text-ink-muted">
                        Model
                        <input
                          value={assistant.anthropicModel}
                          onChange={(e) => setAssistant((s) => ({ ...s, anthropicModel: e.target.value }))}
                          placeholder="claude-sonnet-4-5"
                          className="field mt-1"
                        />
                      </label>
                    </>
                  )}

                  {assistant.provider === "openai" && (
                    <>
                      <label className="text-sm text-ink-muted">
                        OpenAI API key
                        <input
                          type="password"
                          value={assistant.openaiApiKey}
                          onChange={(e) => setAssistant((s) => ({ ...s, openaiApiKey: e.target.value }))}
                          placeholder={settings?.assistant_configured === "true" ? "•••• (unchanged)" : "sk-…"}
                          className="field mt-1"
                        />
                      </label>
                      <label className="text-sm text-ink-muted">
                        Model
                        <input
                          value={assistant.openaiModel}
                          onChange={(e) => setAssistant((s) => ({ ...s, openaiModel: e.target.value }))}
                          placeholder="gpt-4o-mini"
                          className="field mt-1"
                        />
                      </label>
                    </>
                  )}

                  {assistant.provider && (
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={testAssistant}
                        disabled={testingAssistant}
                        className="btn-outline disabled:opacity-50"
                      >
                        {testingAssistant ? "Testing…" : "Test"}
                      </button>
                      <button onClick={saveAssistant} className="btn-primary">
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === "NAS" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">NAS</h2>
                  <p className="text-sm text-ink-muted">
                    Standard SNMP (Host Resources MIB) gives CPU load, memory and volume usage — no
                    vendor-specific API needed. Enable it under{" "}
                    <strong>Settings → Services → SNMP</strong> in ADM, pick the same version below, and
                    enter the matching credentials.
                  </p>

                  <label className="text-sm text-ink-muted">
                    Host
                    <input
                      value={nas.host}
                      onChange={(e) => setNas((s) => ({ ...s, host: e.target.value }))}
                      placeholder="192.168.1.50"
                      className="field mt-1"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-ink-muted">
                      Port
                      <input
                        value={nas.port}
                        onChange={(e) => setNas((s) => ({ ...s, port: e.target.value }))}
                        placeholder="161"
                        className="field mt-1"
                      />
                    </label>
                    <label className="text-sm text-ink-muted">
                      SNMP version
                      <select
                        value={nas.version}
                        onChange={(e) => setNas((s) => ({ ...s, version: e.target.value }))}
                        className="field mt-1"
                      >
                        <option value="3">v3 (user + pass)</option>
                        <option value="2c">v2c (community)</option>
                        <option value="1">v1 (community)</option>
                      </select>
                    </label>
                  </div>

                  {nasIsV3() ? (
                    <>
                      <label className="text-sm text-ink-muted">
                        Username
                        <input
                          value={nas.username}
                          onChange={(e) => setNas((s) => ({ ...s, username: e.target.value }))}
                          className="field mt-1"
                        />
                      </label>
                      <label className="text-sm text-ink-muted">
                        Password
                        <input
                          type="password"
                          value={nas.authKey}
                          onChange={(e) => setNas((s) => ({ ...s, authKey: e.target.value }))}
                          placeholder={settings?.nas_configured === "true" ? "•••• (unchanged)" : ""}
                          className="field mt-1"
                        />
                      </label>

                      <button
                        onClick={() => setNasAdvanced((v) => !v)}
                        className="self-start text-xs font-medium text-accent"
                      >
                        {nasAdvanced ? "Hide advanced options" : "Advanced options"}
                      </button>

                      {nasAdvanced && (
                        <div className="flex flex-col gap-3 rounded-xl sunken-strong p-3">
                          <p className="text-xs text-ink-muted">
                            ASUSTOR's SNMPv3 setup doesn't expose which auth/privacy protocol or whether a
                            separate privacy password it uses internally — SHA + AES with the same
                            password for both is tried by default. If <strong>Test</strong> fails, try the
                            other combinations here, or switch to v2c above if your NAS supports it.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm text-ink-muted">
                              Auth protocol
                              <select
                                value={nas.authProtocol}
                                onChange={(e) => setNas((s) => ({ ...s, authProtocol: e.target.value }))}
                                className="field mt-1"
                              >
                                <option value="sha">SHA</option>
                                <option value="md5">MD5</option>
                              </select>
                            </label>
                            <label className="text-sm text-ink-muted">
                              Privacy protocol
                              <select
                                value={nas.privProtocol}
                                onChange={(e) => setNas((s) => ({ ...s, privProtocol: e.target.value }))}
                                className="field mt-1"
                              >
                                <option value="aes">AES</option>
                                <option value="des">DES</option>
                              </select>
                            </label>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-ink-muted">
                            <input
                              type="checkbox"
                              checked={nasSeparatePriv}
                              onChange={(e) => setNasSeparatePriv(e.target.checked)}
                            />
                            Use a different privacy password
                          </label>
                          {nasSeparatePriv && (
                            <label className="text-sm text-ink-muted">
                              Privacy password
                              <input
                                type="password"
                                value={nas.privKey}
                                onChange={(e) => setNas((s) => ({ ...s, privKey: e.target.value }))}
                                placeholder={settings?.nas_configured === "true" ? "•••• (unchanged)" : ""}
                                className="field mt-1"
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <label className="text-sm text-ink-muted">
                      Community string
                      <input
                        type="password"
                        value={nas.community}
                        onChange={(e) => setNas((s) => ({ ...s, community: e.target.value }))}
                        placeholder={settings?.nas_configured === "true" ? "•••• (unchanged)" : "public"}
                        className="field mt-1"
                      />
                    </label>
                  )}

                  <div className="ml-auto flex gap-2">
                    <button onClick={testNas} disabled={testingNas} className="btn-outline disabled:opacity-50">
                      {testingNas ? "Testing…" : "Test"}
                    </button>
                    <button onClick={saveNas} className="btn-primary">
                      Save
                    </button>
                  </div>

                  {settings?.nas_configured === "true" && (
                    <div className="hairline mt-2 flex flex-col gap-2 border-t pt-4">
                      <p className="text-sm text-ink-muted">
                        ASUSTOR has no public docs for per-disk temperature/SMART OIDs. This walks the
                        saved NAS's Host Resources storage table so real OIDs can be found instead of
                        guessed — share the results if you want that level of detail added.
                      </p>
                      <button
                        onClick={runNasWalk}
                        disabled={walkingNas}
                        className="btn-outline self-start disabled:opacity-50"
                      >
                        {walkingNas ? "Walking…" : "Run diagnostic walk"}
                      </button>
                      {nasWalk && (
                        <pre className="scrollbar-thin max-h-48 overflow-y-auto rounded-xl sunken-strong p-3 text-[11px] text-ink-muted">
                          {nasWalk.length === 0
                            ? "No entries returned."
                            : nasWalk.map((e) => `${e.oid}  (${e.type})  ${e.value}`).join("\n")}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === "Categories" && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">Categories</h2>
                  <div className="flex gap-2">
                    <input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCategory()}
                      placeholder="New category name"
                      className="field flex-1"
                    />
                    <button
                      onClick={addCategory}
                      className="btn-primary"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {categories.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-xl sunken px-3 py-2 text-sm"
                      >
                        {c.name}
                        <button onClick={() => deleteCategory(c.id)} className="text-ink-muted hover:text-red-400">
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tab === "Security" && (
                <form onSubmit={savePassword} className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">Security</h2>
                  <p className="text-sm text-ink-muted">
                    Set a password to lock editing behind a login. Leave current password blank on first setup.
                  </p>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="field"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="field"
                  />
                  <button
                    type="submit"
                    className="btn-primary ml-auto"
                  >
                    Update password
                  </button>
                </form>
              )}
            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
