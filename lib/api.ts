const API = process.env.NEXT_PUBLIC_API_URL as string;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export type Res = { success: boolean; message?: string; network?: boolean; [k: string]: any };

// Never throws. Non-JSON replies (Apps Script HTML error pages), timeouts and offline
// are retried and finally returned as { success:false, network:true, message }.
async function call(url: string, init: RequestInit, retries: number): Promise<Res> {
  if (!API) return { success: false, network: true, message: 'NEXT_PUBLIC_API_URL belum diatur di Vercel.' };
  let msg = '';
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch { msg = 'Server sedang sibuk. Silakan coba lagi.'; }
    } catch (e: any) {
      msg = e && e.name === 'AbortError' ? 'Koneksi terlalu lama. Silakan coba lagi.' : 'Tidak ada koneksi internet.';
    } finally { clearTimeout(to); }
    if (i < retries) await wait(600 * (i + 1));
  }
  return { success: false, network: true, message: msg };
}

// text/plain avoids a CORS preflight, which Apps Script cannot answer
export const post = (body: any, retries = 2) =>
  call(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }, retries);
export const get = (params: Record<string, string>) =>
  call(API + '?' + new URLSearchParams(params).toString(), {}, 2);

export const getPosition = (): Promise<GeolocationPosition> =>
  new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 1 });
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  });

export function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Capture the current frame, resize to 480px wide, compress to JPEG. Returns '' if the video has no frame yet.
export function captureFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) return '';
  const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(video, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.6);
  return url.length > 2000 ? url : '';
}
