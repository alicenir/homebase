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

export interface NasV3Config {
  host: string;
  port: number;
  username: string;
  authProtocol: string;
  authKey: string;
  privProtocol?: string;
  privKey?: string;
}

function config(): NasV3Config | null {
  const host = getSetting("nas_snmp_host");
  const username = getSetting("nas_snmp_username");
  const authKey = getSetting("nas_snmp_auth_key");
  if (!host || !username || !authKey) return null;
  return {
    host,
    port: Number(getSetting("nas_snmp_port") || "161"),
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
function createSession(cfg: NasV3Config) {
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
function withoutPriv(cfg: NasV3Config): NasV3Config {
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
// the broken helper.
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
  laLoad1: "1.3.6.1.4.1.2021.10.1.3.1",
  memTotalReal: "1.3.6.1.4.1.2021.4.5.0",
  memAvailReal: "1.3.6.1.4.1.2021.4.6.0",
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

async function fetchStatus(cfg: NasV3Config): Promise<NasSnapshot> {
  const session = createSession(cfg);
  try {
    const [sysDescrVb, uptimeVb] = await snmpGet(session, [OID.sysDescr, OID.sysUpTime]);
    const sysDescr = toStr(sysDescrVb);
    const uptimeTicks = toNumber(uptimeVb);

    // CPU: try the UCD extension's 1-minute load average first (only
    // present on net-snmpd-style agents); fall back to averaging
    // hrProcessorTable's per-CPU load percentages, which Host Resources MIB
    // implementations are expected to provide regardless of vendor.
    let cpuLoadPercent: number | null = null;
    try {
      const [loadVb] = await snmpGet(session, [OID.laLoad1]);
      const load = toNumber(loadVb);
      // A raw load average isn't a percentage, but on a single/dual-core
      // NAS it's a reasonable proxy — good enough for a status widget.
      if (load != null) cpuLoadPercent = Math.min(load * 100, 100);
    } catch {
      /* try the fallback below */
    }
    if (cpuLoadPercent == null) {
      try {
        const table = await snmpTable(session, OID.hrProcessorTable);
        const loads = Object.values(table)
          .map((row) => Number(row["2"]))
          .filter((n) => Number.isFinite(n));
        if (loads.length > 0) cpuLoadPercent = loads.reduce((a, b) => a + b, 0) / loads.length;
      } catch {
        /* leave null — genuinely unavailable on this agent */
      }
    }

    // Memory: UCD extension first (real KB values), else the RAM row of
    // hrStorageTable (fetched below anyway, so reused rather than re-walked).
    let memTotalBytes: number | null = null;
    let memUsedBytes: number | null = null;
    try {
      const [totalVb, availVb] = await snmpGet(session, [OID.memTotalReal, OID.memAvailReal]);
      const totalKb = toNumber(totalVb);
      const availKb = toNumber(availVb);
      if (totalKb != null && availKb != null) {
        memTotalBytes = totalKb * 1024;
        memUsedBytes = (totalKb - availKb) * 1024;
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
    if (cfg.privKey && isUnsupportedSecurityLevelError(err)) {
      try {
        return await fetchStatus(withoutPriv(cfg));
      } catch (err2) {
        return empty(true, err2 instanceof Error ? err2.message : "unreachable");
      }
    }
    return empty(true, err instanceof Error ? err.message : "unreachable");
  }
}

async function attemptTest(cfg: NasV3Config): Promise<{ ok: boolean; error?: string; sysDescr?: string }> {
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

export async function testConnection(cfg: NasV3Config): Promise<{ ok: boolean; error?: string; sysDescr?: string }> {
  try {
    return await attemptTest(cfg);
  } catch (err) {
    if (cfg.privKey && isUnsupportedSecurityLevelError(err)) {
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

/**
 * A diagnostic walk so a specific NAS's actual OID tree can be inspected —
 * ASUSTOR has no public MIB documentation we can rely on for per-disk
 * temperature/SMART health, so this is how real OIDs get discovered instead
 * of guessed. Defaults to the Host Resources storage table; pass a
 * different root (e.g. a vendor's private enterprise OID once known) to
 * look elsewhere.
 */
function attemptWalk(cfg: NasV3Config, rootOid: string): Promise<{ ok: boolean; error?: string; entries?: WalkEntry[] }> {
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

export async function walk(rootOid = OID.hrStorageTable): Promise<{ ok: boolean; error?: string; entries?: WalkEntry[] }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "not_configured" };

  const first = await attemptWalk(cfg, rootOid);
  if (!first.ok && cfg.privKey && first.error && /unsupported security level/i.test(first.error)) {
    return attemptWalk(withoutPriv(cfg), rootOid);
  }
  return first;
}
