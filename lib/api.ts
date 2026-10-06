const URL_API = process.env.NEXT_PUBLIC_API_URL as string;

// text/plain avoids a CORS preflight, which Apps Script cannot answer
export async function post(body: any) {
  const r = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  return r.json();
}
export async function get(params: Record<string, string>) {
  const r = await fetch(URL_API + '?' + new URLSearchParams(params).toString());
  return r.json();
}

export const getPosition = (): Promise<GeolocationPosition> =>
  new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 1 });
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });

// Capture current video frame, resize to 480px wide and compress to JPEG
export function captureFrame(video: HTMLVideoElement): string {
  const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(video, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.6);
}
