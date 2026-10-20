/**
 * Bản ghi lựa chọn cookie của visitor.
 *
 * Cookie này là cần thiết để ghi nhớ chính lựa chọn đó. Các lựa chọn không
 * thiết yếu mặc định là tắt và chỉ được bật bằng hành động rõ ràng của visitor.
 */
export const COOKIE_CONSENT_COOKIE = "vexim_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_DAYS = 365;
export const COOKIE_CONSENT_MAX_AGE_SECONDS = COOKIE_CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;

export interface CookieConsentChoices {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

export interface CookieConsentRecord extends CookieConsentChoices {
  version: number;
  updatedAt: string;
}

export const REJECTED_COOKIE_CONSENT: CookieConsentChoices = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export const ACCEPTED_COOKIE_CONSENT: CookieConsentChoices = {
  necessary: true,
  analytics: true,
  marketing: true,
};

export function normalizeCookieConsentChoices(value: Partial<CookieConsentChoices> | null | undefined): CookieConsentChoices {
  return {
    necessary: true,
    analytics: value?.analytics === true,
    marketing: value?.marketing === true,
  };
}

export function serializeCookieConsent(choices: Partial<CookieConsentChoices>, updatedAt = new Date()): string {
  const record: CookieConsentRecord = {
    ...normalizeCookieConsentChoices(choices),
    version: COOKIE_CONSENT_VERSION,
    updatedAt: updatedAt.toISOString(),
  };
  return JSON.stringify(record);
}

export function parseCookieConsent(raw: string | null | undefined, now = new Date()): CookieConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Partial<CookieConsentRecord>;
    if (record.version !== COOKIE_CONSENT_VERSION || typeof record.updatedAt !== "string") return null;
    const updatedAt = new Date(record.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    if (updatedAt.getTime() > now.getTime()) return null;
    if (now.getTime() - updatedAt.getTime() > COOKIE_CONSENT_MAX_AGE_SECONDS * 1000) return null;
    return {
      ...normalizeCookieConsentChoices(record),
      version: COOKIE_CONSENT_VERSION,
      updatedAt: updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export function cookieConsentFromDocument(cookieHeader: string, now = new Date()): CookieConsentRecord | null {
  const prefix = `${COOKIE_CONSENT_COOKIE}=`;
  const item = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!item) return null;
  try {
    return parseCookieConsent(decodeURIComponent(item.slice(prefix.length)), now);
  } catch {
    return parseCookieConsent(item.slice(prefix.length), now);
  }
}
