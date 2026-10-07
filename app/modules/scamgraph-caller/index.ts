import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type VerifiedCallerEntry = {
  phone: string;
  label: string;
  source: string;
  evidence_status: 'confirmed_source' | 'community_reviewed';
  retrieved_at: string;
  expires_at?: string;
  is_sample: false;
};
export type CallerDirectory = { entries: VerifiedCallerEntry[]; generated_at: string; expires_at: string; version: string; note?: string };
export type CallerStatus = {
  available: boolean;
  enabled: boolean;
  platform: string;
  roleAvailable: boolean;
  roleHeld: boolean;
  notificationsGranted: boolean;
  cacheCount: number;
  cacheExpiresAt: string | null;
  cacheCurrent: boolean;
  extensionStatus: 'enabled' | 'disabled' | 'unknown' | 'not_applicable' | 'unavailable';
  message: string;
  limitations: string[];
  lastLookup?: { status: 'known_verified_evidence' | 'insufficient_data'; maskedPhone: string; source: string | null; checkedAt: string };
};

interface NativeCaller {
  getStatus(): Promise<CallerStatus>;
  syncDirectory(json: string): Promise<CallerStatus>;
  clearDirectory(): Promise<CallerStatus>;
  disableProtection(): Promise<CallerStatus>;
  requestActivation(): Promise<CallerStatus>;
  requestNotifications(): Promise<unknown>;
  openSettings(): Promise<void>;
}

// Expo Go and web do not register this custom native module. Optional loading
// preserves the rest of the application and never pretends to observe a call.
const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<NativeCaller>('ScamGraphCaller');
const unavailable = (): CallerStatus => ({
  available: false, enabled: false, platform: Platform.OS, roleAvailable: false, roleHeld: false,
  notificationsGranted: false, cacheCount: 0, cacheExpiresAt: null, cacheCurrent: false,
  extensionStatus: 'unavailable',
  message: Platform.OS === 'web' ? 'Incoming calls are available only in a native device build.' : 'This native module requires a ScamGraph development or production build; Expo Go does not include it.',
  limitations: ['No incoming-call access in web or Expo Go.', 'Unknown callers require additional evidence; no absence of a record means safe.'],
});

export async function getCallerStatus(): Promise<CallerStatus> { return native ? native.getStatus() : unavailable(); }
export async function syncCallerDirectory(directory: CallerDirectory): Promise<CallerStatus> {
  if (!native) return unavailable();
  if (!Array.isArray(directory.entries) || directory.entries.length > 10000) throw new Error('Caller directory must contain at most 10,000 entries');
  if (!Number.isFinite(Date.parse(directory.expires_at)) || !Number.isFinite(Date.parse(directory.generated_at))) throw new Error('Caller directory timestamps are invalid');
  const seen = new Set<string>();
  const entries = directory.entries.filter(entry => {
    if (entry.is_sample !== false || !['confirmed_source', 'community_reviewed'].includes(entry.evidence_status)) return false;
    if (!/^\+[1-9]\d{7,14}$/.test(entry.phone) || !entry.source?.trim() || !entry.label?.trim()) return false;
    if (entry.expires_at && Date.parse(entry.expires_at) <= Date.now()) return false;
    if (seen.has(entry.phone)) return false;
    seen.add(entry.phone);
    return true;
  }).map(entry => ({phone: entry.phone, label: entry.label.slice(0, 100), source: entry.source.slice(0, 120), evidence_status: entry.evidence_status, retrieved_at: entry.retrieved_at, expires_at: entry.expires_at || directory.expires_at, is_sample: false}));
  return native.syncDirectory(JSON.stringify({...directory, entries}));
}
export async function clearCallerDirectory(): Promise<CallerStatus> { return native ? native.clearDirectory() : unavailable(); }
export async function disableCallerProtection(): Promise<CallerStatus> { return native ? native.disableProtection() : unavailable(); }
/** Call only as a direct consequence of the user's activation button. */
export async function requestCallerActivation(): Promise<CallerStatus> { return native ? native.requestActivation() : unavailable(); }
/** Android 13+ notification consent is separate from the screening role. */
export async function requestCallerNotifications(): Promise<CallerStatus> {
  if (!native) return unavailable();
  await native.requestNotifications();
  return native.getStatus();
}
export async function openCallerSettings(): Promise<void> { if (native) await native.openSettings(); }
