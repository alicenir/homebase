import * as snmp from "net-snmp";
import { getSetting } from "../db.js";

export interface NasVolume {
  name: string;
  totalBytes: number;
  usedBytes: number;
}

export interface NasSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  sysDescr: string | null;
  uptimeSeconds: number | null;
  cpuLoadPercent: number | null;
  memTotalBytes: number | null;
  memUsedBytes: number | null;
  volumes: NasVolume[];
}

export interface NasConfigV3 {
  version: "3";
  host: string;
  port: number;
  username: string;
  authProtocol: string;
  authKey: string;
  privProtocol?: string;
  privKey?: string;
}

export interface NasConfigV1 {
  version: "1";
  host: string;
  port: number;
  community: string;
}

export interface NasConfigV2c {
  version: "2c";
  host: string;
  port: number;
  community: string;
}

export type NasConfig = NasConfigV3 | NasConfigV1 | NasConfigV2c;

function config(): NasConfig | null {
  const host = getSetting("nas_snmp_host");
  if (!host) return null;
  const port = Number(getSetting("nas_snmp_port") || "161");
  const version = (getSetting("nas_snmp_version") || "3") as NasConfig["version"];

  if (version === "1" || version === "2c") {
    const community = getSetting("nas_snmp_community");
    if (!community) return null;
    return { version, host, port, community };
  }

  const username = getSetting("nas_snmp_username");
  const authKey = getSetting("nas_snmp_auth_key");
  if (!username || !authKey) return null;
  return {
    version: "3",
    host,
    port,
    username,
    authProtocol: getSetting("nas_snmp_auth_protocol") || "sha",
    authKey,
    privProtocol: getSetting("nas_snmp_priv_protocol") || "aes",
    privKey: getSetting("nas_snmp_priv_key") || undefined,
  };
}

// Enum reverse-lookup by our own stored setting string ("sha", "aes", ...) —
// cast through unknown since the enum's own index signature is keyed by its
// member names as a union, not a general string.
function protocolValue(protocols: object, name: string, fallback: number): number {
  return (protocols as unknown as Record<string, number>)[name] ?? fallback;
}

// Some NAS SNMPv3 setups (ASUSTOR's ADM included) only ever provision a
// single password for authentication and never configure an encryption
// (privacy) key for the user at all — dropping to authNoPriv is not a
// downgrade we chose, it's the only level that user actually supports.
function createSession(cfg: NasConfig) {
  if (cfg.version === "1" || cfg.version === "2c") {
    return snmp.createSession(cfg.host, cfg.community, {
      port: cfg.port,
      timeout: 5000,
      retries: 1,
      version: cfg.version === "1" ? snmp.Version1 : snmp.Version2c,
    });
  }

  const hasPriv = Boolean(cfg.privKey);
  const user: snmp.User = {
    name: cfg.username,
    level: hasPriv ? snmp.SecurityLevel.authPriv : snmp.SecurityLevel.authNoPriv,
    authProtocol: protocolValue(snmp.AuthProtocols, cfg.authProtocol, snmp.AuthProtocols.sha),
    authKey: cfg.authKey,
  };
  if (hasPriv) {
    user.privProtocol = protocolValue(snmp.PrivProtocols, cfg.privProtocol ?? "aes", snmp.PrivProtocols.aes);
    user.privKey = cfg.privKey;
  }
  return snmp.createV3Session(cfg.host, user, { port: cfg.port, timeout: 5000, retries: 1 });
}

function isUnsupportedSecurityLevelError(err: unknown): boolean {
  return err instanceof Error && /unsupported security level/i.test(err.message);
}

// Drops the privacy key so a retry authenticates as authNoPriv instead of
// authPriv — used when the agent reports the user doesn't support
// encryption, rather than as an upfront guess.
function withoutPriv(cfg: NasConfigV3): NasConfigV3 {
  return { ...cfg, privProtocol: undefined, privKey: undefined };
}

function snmpGet(session: snmp.Session, oids: string[]): Promise<snmp.Varbind[]> {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error || !varbinds) reject(error ?? new Error("No response"));
      else resolve(varbinds);
    });
  });
}

function isError(varbind: snmp.Varbind): boolean {
  return snmp.isVarbindError(varbind);
}

function rawValue(varbind: snmp.Varbind): unknown {
  const v = varbind.value;
  return Buffer.isBuffer(v) ? v.toString("utf8").trim() : v;
}

// net-snmp's own session.table() silently returns an empty table over an
// SNMPv3 session (verified directly against a real snmpd — its lower-level
// walk()/subtree() return every row correctly, so the bug is specifically
// in table()'s row/column OID-matching, not in the v3 transport). Rebuilt
// on top of subtree(), which is confirmed working, instead of depending on
// the broken helper. Works the same way for v1/v2c sessions.
function snmpTable(session: snmp.Session, oid: string): Promise<Record<string, Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const table: Record<string, Record<string, unknown>> = {};
    session.subtree(
      oid,
      20,
      (varbinds: snmp.Varbind[]) => {
        for (const vb of varbinds) {
          if (isError(vb)) continue;
          if (!vb.oid.startsWith(`${oid}.`)) continue;
          const suffix = vb.oid.slice(oid.length + 1);
          const dot = suffix.indexOf(".");
          if (dot < 0) continue;
          const column = suffix.slice(0, dot);
          const rowIndex = suffix.slice(dot + 1);
          if (!table[rowIndex]) table[rowIndex] = {};
          table[rowIndex][column] = rawValue(vb);
        }
      },
      (error: Error | null) => {
        if (error) reject(error);
        else resolve(table);
      }
    );
  });
}

function toNumber(varbind: snmp.Varbind): number | null {
  if (isError(varbind)) return null;
  const v = varbind.value;
  if (typeof v === "number") return v;
  if (Buffer.isBuffer(v)) {
    const n = Number(v.toString("utf8").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(varbind: snmp.Varbind): string | null {
  if (isError(varbind)) return null;
  const v = varbind.value;
  if (Buffer.isBuffer(v)) return v.toString("utf8").trim();
  if (typeof v === "string") return v;
  return null;
}

// RFC 2790 hrStorageType values (1.3.6.1.2.1.25.2.1.x) worth showing as
// "volumes" — physical/network disks, not RAM or virtual memory (already
// covered separately) and not removable/optical media.
const VOLUME_TYPE_SUFFIXES = [".4", ".10"]; // hrStorageFixedDisk, hrStorageNetworkDisk
const RAM_TYPE_SUFFIX = ".2"; // hrStorageRam

const OID = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  ssCpuIdle: "1.3.6.1.4.1.2021.11.11.0",
  laLoad1: "1.3.6.1.4.1.2021.10.1.3.1",
  memTotalReal: "1.3.6.1.4.1.2021.4.5.0",
  memAvailReal: "1.3.6.1.4.1.2021.4.6.0",
  memBuffer: "1.3.6.1.4.1.2021.4.14.0",
  memCached: "1.3.6.1.4.1.2021.4.15.0",
  hrStorageTable: "1.3.6.1.2.1.25.2.3.1",
  hrProcessorTable: "1.3.6.1.2.1.25.3.3.1",
};

function empty(configured: boolean, error?: string): NasSnapshot {
  return {
    configured,
    reachable: false,
    error,
    sysDescr: null,
    uptimeSeconds: null,
    cpuLoadPercent: null,
    memTotalBytes: null,
    memUsedBytes: null,
    volumes: [],
  };
}

async function fetchStatus(cfg: NasConfig): Promise<NasSnapshot> {
  const session = createSession(cfg);
  try {
    const [sysDescrVb, uptimeVb] = await snmpGet(session, [OID.sysDescr, OID.sysUpTime]);
    const sysDescr = toStr(sysDescrVb);
    const uptimeTicks = toNumber(uptimeVb);

    // CPU: hrProcessorTable's per-CPU load first — RFC 2790 defines it as
    // "the average, over the last minute, of the percentage of time this
    // processor was not idle", i.e. already a real percentage, mandatory for
    // Host Resources MIB implementations. A 1-minute *load average* (UCD's
    // laLoad1) is a queue-length metric, not a percentage — multiplying it
    // by 100 badly overstates load on any multi-core box (a load average of
    // 1.0 pegs the gauge at 100% even when only one of many cores is busy),
    // which is why it's not used here at all despite being simpler to read.
    let cpuLoadPercent: number | null = null;
    let processorCount = 0;
    try {
      const table = await snmpTable(session, OID.hrProcessorTable);
      processorCount = Object.keys(table).length;
      const loads = Object.values(table)
        .map((row) => Number(row["2"]))
        .filter((n) => Number.isFinite(n));
      if (loads.length > 0) cpuLoadPercent = loads.reduce((a, b) => a + b, 0) / loads.length;
    } catch {
      /* try the fallbacks below */
    }
    if (cpuLoadPercent == null) {
      try {
        const [idleVb] = await snmpGet(session, [OID.ssCpuIdle]);
        const idle = toNumber(idleVb);
        if (idle != null) cpuLoadPercent = Math.max(0, Math.min(100 - idle, 100));
      } catch {
        /* try the last-resort fallback below */
      }
    }
    // Last resort: some minimal Host Resources implementations enumerate
    // processor rows (giving us a real core count) without ever populating
    // hrProcessorLoad itself — seen on a real test agent, and plausible on
    // ASUSTOR's own non-standard agent. A bare load average only means
    // something once divided by how many cores it's spread across; treating
    // it as a raw percentage (the previous behaviour) pegged the gauge near
    // 100% on any multi-core box even at genuinely low utilization.
    if (cpuLoadPercent == null) {
      try {
        const [loadVb] = await snmpGet(session, [OID.laLoad1]);
        const load = toNumber(loadVb);
        if (load != null) cpuLoadPercent = Math.max(0, Math.min((load / Math.max(processorCount, 1)) * 100, 100));
      } catch {
        /* leave null — genuinely unavailable on this agent */
      }
    }

    // Memory: UCD extension's total/available, corrected for buffers/cache
    // when available. memAvailReal on many SNMP agents (including older
    // net-snmp builds ASUSTOR's is likely derived from) reports raw free
    // memory, not Linux's "available" figure — on a NAS, which uses spare
    // RAM heavily for file-serving page cache, that makes used memory look
    // close to 100% even when actual application usage is a small fraction.
    // Subtracting reclaimable buffers/cache (the same correction `free`
    // applies) gets this back in line with what ADM's own Activity Monitor
    // reports. Falls back to the uncorrected total-minus-free figure when
    // buffer/cache OIDs aren't available, and further to hrStorageTable's
    // RAM row below when even that isn't.
    let memTotalBytes: number | null = null;
    let memUsedBytes: number | null = null;
    try {
      const [totalVb, availVb, bufferVb, cachedVb] = await snmpGet(session, [
        OID.memTotalReal,
        OID.memAvailReal,
        OID.memBuffer,
        OID.memCached,
      ]);
      const totalKb = toNumber(totalVb);
      const availKb = toNumber(availVb);
      const bufferKb = toNumber(bufferVb) ?? 0;
      const cachedKb = toNumber(cachedVb) ?? 0;
      if (totalKb != null && availKb != null) {
        memTotalBytes = totalKb * 1024;
        memUsedBytes = Math.max(0, totalKb - availKb - bufferKb - cachedKb) * 1024;
      }
    } catch {
      /* try the storage-table RAM row below */
    }

    const volumes: NasVolume[] = [];
    try {
      const table = await snmpTable(session, OID.hrStorageTable);
      for (const row of Object.values(table)) {
        const type = String(row["2"] ?? "");
        const units = Number(row["4"]) || 1;
        const size = Number(row["5"]);
        const used = Number(row["6"]);
        if (!Number.isFinite(size) || !Number.isFinite(used)) continue;

        if (memTotalBytes == null && type.endsWith(RAM_TYPE_SUFFIX)) {
          memTotalBytes = size * units;
          memUsedBytes = used * units;
          continue;
        }
        if (VOLUME_TYPE_SUFFIXES.some((suffix) => type.endsWith(suffix))) {
          volumes.push({
            name: String(row["3"] ?? "Volume"),
            totalBytes: size * units,
            usedBytes: used * units,
          });
        }
      }
    } catch {
      /* leave volumes empty — hrStorageTable is mandatory in the MIB, but
         be defensive against agents that don't implement it fully */
    }

    return {
      configured: true,
      reachable: true,
      sysDescr,
      uptimeSeconds: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
      cpuLoadPercent,
      memTotalBytes,
      memUsedBytes,
      volumes,
    };
  } finally {
    session.close();
  }
}

export async function getStatus(): Promise<NasSnapshot> {
  const cfg = config();
  if (!cfg) return empty(false);

  try {
    return await fetchStatus(cfg);
  } catch (err) {
    if (cfg.version === "3" && cfg.privKey && isUnsupportedSecurityLevelError(err)) {
      try {
        return await fetchStatus(withoutPriv(cfg));
      } catch (err2) {
        return empty(true, err2 instanceof Error ? err2.message : "unreachable");
      }
    }
    return empty(true, err instanceof Error ? err.message : "unreachable");
  }
}

async function attemptTest(cfg: NasConfig): Promise<{ ok: boolean; error?: string; sysDescr?: string }> {
  const session = createSession(cfg);
  try {
    const [sysDescrVb] = await snmpGet(session, [OID.sysDescr]);
    const sysDescr = toStr(sysDescrVb);
    if (sysDescr == null) return { ok: false, error: "No response for sysDescr" };
    return { ok: true, sysDescr };
  } finally {
    session.close();
  }
}

export async function testConnection(cfg: NasConfig): Promise<{ ok: boolean; error?: string; sysDescr?: string }> {
  try {
    return await attemptTest(cfg);
  } catch (err) {
    if (cfg.version === "3" && cfg.privKey && isUnsupportedSecurityLevelError(err)) {
      try {
        return await attemptTest(withoutPriv(cfg));
      } catch (err2) {
        return { ok: false, error: err2 instanceof Error ? err2.message : "Connection failed" };
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export interface WalkEntry {
  oid: string;
  type: string;
  value: string;
}

const WALK_LIMIT = 300;

function attemptWalk(cfg: NasConfig, rootOid: string): Promise<{ ok: boolean; error?: string; entries?: WalkEntry[] }> {
  const session = createSession(cfg);
  const entries: WalkEntry[] = [];
  return new Promise((resolve) => {
    session.subtree(
      rootOid,
      20,
      (varbinds: snmp.Varbind[]) => {
        for (const vb of varbinds) {
          if (entries.length >= WALK_LIMIT) break;
          if (isError(vb)) continue;
          const typeName = vb.type != null ? snmp.ObjectType[vb.type] ?? String(vb.type) : "unknown";
          const value = Buffer.isBuffer(vb.value) ? vb.value.toString("utf8").trim() : String(vb.value);
          entries.push({ oid: vb.oid, type: typeName, value });
        }
      },
      (error: Error | null) => {
        session.close();
        if (error) resolve({ ok: false, error: error.message });
        else resolve({ ok: true, entries });
      }
    );
  });
}

/**
 * A diagnostic walk so a specific NAS's actual OID tree can be inspected —
 * ASUSTOR has no public MIB documentation we can rely on for per-disk
 * temperature/SMART health, so this is how real OIDs get discovered instead
 * of guessed. Defaults to the Host Resources storage table; pass a
 * different root (e.g. a vendor's private enterprise OID once known) to
 * look elsewhere.
 */
export async function walk(rootOid = OID.hrStorageTable): Promise<{ ok: boolean; error?: string; entries?: WalkEntry[] }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "not_configured" };

  const first = await attemptWalk(cfg, rootOid);
  if (!first.ok && cfg.version === "3" && cfg.privKey && first.error && /unsupported security level/i.test(first.error)) {
    return attemptWalk(withoutPriv(cfg), rootOid);
  }
  return first;
}
