'use client';

export function getOrCreateSubscriberId(): string {
  const key = 'qpick_subscriber_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sub_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  localStorage.setItem(key, id);
  return id;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker非対応のブラウザです。');
  return await navigator.serviceWorker.register('/sw.js');
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function subscribePush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('通知が許可されませんでした。');

  const reg = await ensureServiceWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error('VAPID公開鍵が未設定です。');

  return await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function unsubscribePush(): Promise<void> {
  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}