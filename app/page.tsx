'use client';
import { useEffect, useRef, useState } from 'react';
import { get, post, getPosition, captureFrame, distance } from '@/lib/api';

type Step = 'IDLE' | 'LOADING' | 'CHECKING_LOCATION' | 'LOCATION_READY' | 'LOCATION_ERROR' | 'OPENING_CAMERA' |
  'CAMERA_READY' | 'CAPTURING' | 'PHOTO_READY' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
type View = 'login' | 'dashboard' | 'attendance' | 'history';

const MSG = {
  gps: 'Lokasi tidak dapat diakses.\nSilakan aktifkan GPS dan izinkan akses lokasi.',
  acc: 'Akurasi lokasi terlalu rendah.\nSilakan coba di area terbuka.',
  out: 'Anda berada di luar area absensi.',
  cam: 'Kamera tidak dapat diakses.\nSilakan izinkan akses kamera.',
  fail: 'Absensi gagal disimpan.\nSilakan coba lagi.',
  net: 'Koneksi bermasalah. Cek dashboard apakah absensi sudah tercatat sebelum mencoba lagi.',
};
const tgl = (d: Date) => d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
const jam = (d: Date) => d.toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
const sapa = (d: Date) => { const h = d.getHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 19 ? 'sore' : 'malam'; };
const todayKey = () => new Date().toLocaleDateString('en-CA');

export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('login');
  const [step, setStep] = useState<Step>('IDLE');
  const [auth, setAuth] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [empId, setEmpId] = useState('');
  const [pin, setPin] = useState('');
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [geo, setGeo] = useState<any>(null);
  const [photo, setPhoto] = useState('');
  const [result, setResult] = useState<any>(null);
  const [shotAt, setShotAt] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    try { // restore session instantly from cache, refresh in background
      const s = localStorage.getItem('absensi_auth');
      if (s) {
        const a = JSON.parse(s); setAuth(a); setView('dashboard');
        const c = localStorage.getItem('absensi_dash');
        const p = c ? JSON.parse(c) : null;
        if (p && p.day === todayKey()) { setDash(p.dash); loadDash(a, true); }
        else loadDash(a, false);
      }
    } catch {}
    setReady(true);
    return () => { clearInterval(t); stopCam(); };
  }, []);

  // attach the camera stream once the <video> element exists
  useEffect(() => {
    const v = videoRef.current;
    if (step === 'CAMERA_READY' && v && stream) {
      if (v.srcObject !== stream) v.srcObject = stream;
      v.muted = true;
      v.play().catch(() => {});
    }
  }, [step, stream]);

  function stopCam() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setStream(null); setVideoReady(false);
  }
  function logout() {
    stopCam(); localStorage.removeItem('absensi_auth'); localStorage.removeItem('absensi_dash');
    setAuth(null); setDash(null); setView('login'); setStep('IDLE'); setErr('');
  }
  function saveDash(d: any) { setDash(d); try { localStorage.setItem('absensi_dash', JSON.stringify({ day: todayKey(), dash: d })); } catch {} }

  async function loadDash(a: any, silent = false) {
    if (!silent) { setStep('LOADING'); setErr(''); }
    const r = await get({ action: 'dashboard', employeeId: a.user.id, token: a.token });
    if (!r.success) {
      if (/Sesi/.test(r.message || '')) return logout();
      if (!silent) { setErr(r.message || 'Gagal memuat data.'); setStep('ERROR'); setView('dashboard'); }
      return;
    }
    saveDash(r);
    if (!silent) { setView('dashboard'); setStep('IDLE'); }
  }

  async function login() {
    setStep('LOADING'); setErr('');
    const r = await post({ action: 'login', employeeId: empId.trim(), pin: pin.trim() });
    if (!r.success) { setErr(r.message || 'Gagal masuk.'); setStep('ERROR'); return; }
    const a = { token: r.token, user: r.user };
    localStorage.setItem('absensi_auth', JSON.stringify(a));
    setAuth(a); setPin(''); saveDash(r.dash); setView('dashboard'); setStep('IDLE');
  }

  async function startAttendance(t: 'IN' | 'OUT') {
    setType(t); setView('attendance'); setErr(''); setPhoto(''); setResult(null); setGeo(null);
    stopCam(); setStep('CHECKING_LOCATION');
    try {
      const pos = await getPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const o = dash?.summary?.office;
      let d: number, radius: number;
      if (o && isFinite(o.lat) && isFinite(o.lng)) { // instant check, no network round trip
        if (accuracy > o.accMax) throw { msg: MSG.acc };
        d = distance(latitude, longitude, o.lat, o.lng); radius = o.radius;
      } else {
        const r = await post({ action: 'validateLocation', employeeId: auth.user.id, token: auth.token, latitude, longitude, accuracy });
        if (!r.success) throw { msg: r.message || MSG.fail };
        d = r.distance; radius = r.radius;
      }
      setGeo({ latitude, longitude, accuracy, distance: d, radius });
      if (d > radius) throw { msg: `${MSG.out}\nJarak: ${d} meter\nRadius maksimal: ${radius} meter` };
      setStep('LOCATION_READY');
      await openCamera();
    } catch (e: any) {
      setErr(e && e.code ? MSG.gps : (e && e.msg) || MSG.fail); setStep('LOCATION_ERROR');
    }
  }

  async function openCamera() {
    setErr(''); setVideoReady(false); setStep('OPENING_CAMERA'); stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr(MSG.cam + '\n(Buka lewat HTTPS dan gunakan browser terbaru.)'); setStep('ERROR'); return;
    }
    let s: MediaStream | null = null;
    try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); }
    catch { try { s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch {} }
    if (!s) { setErr(MSG.cam); setStep('ERROR'); return; }
    streamRef.current = s; setStream(s); setStep('CAMERA_READY');
  }

  function capture() {
    const v = videoRef.current;
    const data = v ? captureFrame(v) : '';
    if (!data) { setErr('Kamera belum siap. Tunggu sebentar lalu coba lagi.'); return; }
    setErr(''); setPhoto(data); setShotAt(jam(new Date())); stopCam(); setStep('PHOTO_READY');
  }

  async function submit() {
    setStep('UPLOADING'); setErr('');
    const r = await post({ action: 'attendance', employeeId: auth.user.id, token: auth.token, type,
      latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy, photo }, 0);
    if (!r.success) { setErr(r.network ? MSG.net : r.message || MSG.fail); setStep('ERROR'); return; }
    if (dash) saveDash({ ...dash, today: { checkIn: type === 'IN' ? r.time : dash.today?.checkIn || null, checkOut: type === 'OUT' ? r.time : dash.today?.checkOut || null } });
    setResult(r); setStep('SUCCESS');
  }

  function back() {
    stopCam(); setStep('IDLE'); setErr(''); setView('dashboard');
    if (auth) loadDash(auth, true);
  }
  async function goHistory() {
    setView('history'); setHist(null);
    const r = await get({ action: 'history', employeeId: auth.user.id, token: auth.token });
    if (r.success) setHist(r.data); else { if (/Sesi/.test(r.message || '')) return logout(); setHist([]); setErr(r.message || ''); }
  }

  if (!ready) return null;
  const t = dash?.today;

  /* ---------- LOGIN ---------- */
  if (view === 'login') return (
    <>
      <h1 style={{ marginTop: 48 }}>Absensi</h1>
      <p className="muted">Masuk dengan ID karyawan dan PIN Anda.</p>
      <div className="card">
        <label htmlFor="id">ID Karyawan</label>
        <input id="id" value={empId} onChange={e => setEmpId(e.target.value)} placeholder="EMP001" autoCapitalize="characters" />
        <label htmlFor="pin">PIN</label>
        <input id="pin" type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••"
          onKeyDown={e => e.key === 'Enter' && empId && pin && step !== 'LOADING' && login()} />
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={step === 'LOADING' || !empId || !pin} onClick={login}>
          {step === 'LOADING' ? 'Memeriksa...' : 'Masuk'}
        </button>
      </div>
    </>
  );

  /* ---------- ATTENDANCE ---------- */
  if (view === 'attendance') return (
    <>
      <button className="back" onClick={back}>‹ Kembali</button>
      <h2>{type === 'IN' ? 'Absen masuk' : 'Absen pulang'}</h2>

      {(step === 'CHECKING_LOCATION' || step === 'LOCATION_READY') && <div className="card"><span className="spin" />Meminta lokasi...</div>}
      {step === 'OPENING_CAMERA' && <div className="card"><span className="spin" />Membuka kamera...</div>}

      {step === 'CAMERA_READY' && <>
        <div className="cam">
          <video ref={videoRef} autoPlay playsInline muted onPlaying={() => setVideoReady(true)} />
          {!videoReady && <div className="ov"><span className="spin" />Menyalakan kamera...</div>}
          <div className="frame"><div className="scan" /></div>
        </div>
        <p className="info">Lokasi valid · Jarak Anda {geo?.distance} meter dari kantor (maks. {geo?.radius} meter)</p>
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={!videoReady} onClick={capture}>Ambil foto</button>
      </>}

      {(step === 'PHOTO_READY' || step === 'UPLOADING' || (step === 'ERROR' && photo)) && <div className="card">
        <h2>Konfirmasi absensi</h2>
        <div className="cam" style={{ aspectRatio: '4/5' }}><img src={photo} alt="Foto selfie" /></div>
        <div className="status"><span>{auth?.user?.name}</span><span className="muted">{auth?.user?.id}</span></div>
        <div className="status"><span>Lokasi</span><span className="pill ok">Valid · {geo?.distance} meter</span></div>
        <div className="status"><span>Waktu foto</span><span>{shotAt}</span></div>
        {err && <div className="err">{err}</div>}
        <div className="row">
          <button className="btn ghost" disabled={step === 'UPLOADING'} onClick={() => { setPhoto(''); openCamera(); }}>Ulangi</button>
          <button className="btn" disabled={step === 'UPLOADING'} onClick={submit}>{step === 'UPLOADING' ? 'Menyimpan absensi...' : 'Konfirmasi'}</button>
        </div>
      </div>}

      {(step === 'LOCATION_ERROR' || (step === 'ERROR' && !photo)) && <div className="card">
        <div className="err" style={{ marginTop: 0 }}>{err}</div>
        <button className="btn" onClick={() => startAttendance(type)}>Coba lagi</button>
      </div>}

      {step === 'SUCCESS' && result && <div className="card">
        <div className="big">✓</div>
        <h2 style={{ textAlign: 'center' }}>Absensi berhasil</h2>
        <div className="status"><span>Nama</span><span>{result.name}</span></div>
        <div className="status"><span>Jenis</span><span>{type === 'IN' ? 'Absen masuk' : 'Absen pulang'}</span></div>
        <div className="status"><span>Waktu</span><span>{result.time}</span></div>
        <div className="status"><span>Jarak</span><span>{result.distance} meter</span></div>
        <button className="btn" onClick={back}>Kembali ke dashboard</button>
      </div>}
    </>
  );

  /* ---------- HISTORY ---------- */
  if (view === 'history') return (
    <>
      <button className="back" onClick={() => { setErr(''); setView('dashboard'); }}>‹ Kembali</button>
      <h2>Riwayat absensi</h2>
      <div className="card">
        {hist === null ? <p className="muted"><span className="spin" />Memuat riwayat...</p>
          : hist.length === 0 ? <p className="muted">{err || 'Belum ada riwayat absensi.'}</p>
          : <table><thead><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th></tr></thead>
              <tbody>{hist.map(h => <tr key={h.date}><td>{h.date}</td><td>{h.checkIn || '-'}</td><td>{h.checkOut || '-'}</td></tr>)}</tbody></table>}
      </div>
    </>
  );

  /* ---------- DASHBOARD ---------- */
  return (
    <>
      <p className="muted">{now ? tgl(now) : ''}</p>
      <h1>{now ? `Selamat ${sapa(now)}, ` : ''}{auth?.user?.name}</h1>
      <p className="clock">{now ? jam(now) : ''}</p>
      {step === 'LOADING' && <p className="info"><span className="spin" />Memuat data...</p>}
      {err && <div className="err">{err}</div>}
      <div className="card">
        <div className="status"><span>Absen masuk</span>{t?.checkIn ? <span className="pill ok">{t.checkIn}</span> : <span className="pill">Belum absen</span>}</div>
        <div className="status"><span>Absen pulang</span>{t?.checkOut ? <span className="pill ok">{t.checkOut}</span> : <span className="pill">{t?.checkIn ? 'Belum absen' : 'Belum tersedia'}</span>}</div>
        {!t?.checkIn && <button className="btn" disabled={!dash} onClick={() => startAttendance('IN')}>Absen masuk sekarang</button>}
        {t?.checkIn && !t?.checkOut && <button className="btn" onClick={() => startAttendance('OUT')}>Absen pulang sekarang</button>}
        {t?.checkIn && t?.checkOut && <p className="info">Absensi hari ini selesai.</p>}
      </div>
      <div className="card">
        <h2>Riwayat terakhir</h2>
        {dash?.summary?.recent?.length ? <table><tbody>{dash.summary.recent.map((h: any) =>
          <tr key={h.date}><td>{h.date}</td><td>{h.checkIn || '-'}</td><td>{h.checkOut || '-'}</td></tr>)}</tbody></table>
          : <p className="muted">Belum ada riwayat absensi.</p>}
        <div className="row"><button className="btn ghost" onClick={goHistory}>Lihat semua</button><button className="btn ghost" onClick={logout}>Keluar</button></div>
      </div>
    </>
  );
}
