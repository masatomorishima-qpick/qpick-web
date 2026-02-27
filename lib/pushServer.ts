import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@example.com';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID鍵が未設定です。');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPush(sub: StoredSubscription, payload: Record<string, unknown>) {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any,
      JSON.stringify(payload)
    );
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, statusCode: e?.statusCode };
  }
}