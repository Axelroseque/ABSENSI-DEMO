'use client';
import { useEffect, useRef, useState } from 'react';
import { get, post, getPosition, captureFrame } from '@/lib/api';

type Step = 'IDLE' | 'LOADING' | 'CHECKING_LOCATION' | 'LOCATION_READY' | 'LOCATION_ERROR' | 'OPENING_CAMERA' |
  'CAMERA_READY' | 'CAPTURING' | 'PHOTO_READY' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
type View = 'login' | 'dashboard' | 'attendance' | 'history';

const MSG = {
  gps: 'Lokasi tidak dapat diakses.\nSilakan aktifkan GPS dan izinkan akses lokasi.',
  acc: 'Akurasi lokasi terlalu rendah.\nSilakan coba di area terbuka.',
  out: 'Anda berada di luar area absensi.',
  cam: 'Kamera tidak dapat diakses.\nSilakan izinkan akses kamera.',
  fail: 'Absensi gagal disimpan.\nSilakan coba lagi.',
};
const tgl = (d: Date) => d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
const jam = (d: Date) => d.toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
const sapa = (d: Date) => { const h = d.getHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 19 ? 'sore' : 'malam'; };

export default function App() {
  const [view, setView] = useState<View>('login');
  const [step, setStep] = useState<Step>('IDLE');
  const [auth, setAuth] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(new Date());
  const [empId, setEmpId] = useState('');
  const [pin, setPin] = useState('');
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [geo, setGeo] = useState<any>(null);
  const [photo, setPhoto] = useState('');
  const [result, setResult] = useState<any>(null);
  const [shotAt, setShotAt] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { // restore session
    const s = localStorage.getItem('absensi_auth');
    if (s) { const a = JSON.parse(s); setAuth(a); loadDash(a); }
  }, []);
  useEffect(() => () => stopCam(), []);

  const stopCam = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  const logout = () => { localStorage.removeItem('absensi_auth'); setAuth(null); setDash(null); setView('login'); setStep('IDLE'); };

  async function loadDash(a = auth) {
    setStep('LOADING'); setErr('');
    try {
      const r = await get({ action: 'dashboard', employeeId: a.user.id, token: a.token });
      if (!r.success) { if (/Sesi/.test(r.message)) return logout(); throw new Error(r.message); }
      setDash(r); setView('dashboard'); setStep('IDLE');
    } catch (e: any) { setErr(e.message || 'Gagal memuat data.'); setStep('ERROR'); setView('dashboard'); }
  }

  async function login() {
    setStep('LOADING'); setErr('');
    try {
      const r = await post({ action: 'login', employeeId: empId.trim(), pin });
      if (!r.success) throw new Error(r.message);
      const a = { token: r.token, user: r.user };
      localStorage.setItem('absensi_auth', JSON.stringify(a)); setAuth(a); setPin('');
      await loadDash(a);
    } catch (e: any) { setErr(e.message || 'Gagal masuk.'); setStep('ERROR'); }
  }

  async function startAttendance(t: 'IN' | 'OUT') {
    setType(t); setView('attendance'); setErr(''); setPhoto(''); setResult(null); setGeo(null);
    setStep('CHECKING_LOCATION');
    try {
      const pos = await getPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const r = await post({ action: 'validateLocation', employeeId: auth.user.id, token: auth.token, latitude, longitude, accuracy });
      if (!r.success) throw { msg: r.message };
      if (!r.valid) { setGeo({ latitude, longitude, accuracy, distance: r.distance, radius: r.radius }); throw { msg: `${MSG.out}\nJarak: ${r.distance} meter\nRadius maksimal: ${r.radius} meter` }; }
      setGeo({ latitude, longitude, accuracy, distance: r.distance, radius: r.radius });
      setStep('LOCATION_READY');
      await openCamera();
    } catch (e: any) {
      setErr(e.code ? MSG.gps : e.msg || MSG.fail); setStep('LOCATION_ERROR');
    }
  }

  async function openCamera() {
    setStep('OPENING_CAMERA');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = s; setStep('CAMERA_READY');
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 0);
    } catch { setErr(MSG.cam); setStep('ERROR'); }
  }

  function capture() {
    if (!videoRef.current) return;
    setStep('CAPTURING');
    setPhoto(captureFrame(videoRef.current)); setShotAt(jam(new Date()));
    stopCam(); setStep('PHOTO_READY');
  }

  async function submit() {
    setStep('UPLOADING'); setErr('');
    try {
      const r = await post({ action: 'attendance', employeeId: auth.user.id, token: auth.token, type,
        latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy, photo });
      if (!r.success) throw new Error(r.message);
      setResult(r); setStep('SUCCESS');
    } catch (e: any) { setErr(e.message || MSG.fail); setStep('ERROR'); }
  }

  const back = () => { stopCam(); setStep('IDLE'); setView('dashboard'); loadDash(); };
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
          onKeyDown={e => e.key === 'Enter' && login()} />
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={step === 'LOADING' || !empId || !pin} onClick={login}>
          {step === 'LOADING' ? 'Memeriksa...' : 'Masuk'}
        </button>
      </div>
    </>
  );

  /* ---------- ATTENDANCE (location → camera → confirm → result) ---------- */
  if (view === 'attendance') return (
    <>
      <button className="back" onClick={back}>‹ Kembali</button>
      <h2>{type === 'IN' ? 'Absen masuk' : 'Absen pulang'}</h2>

      {step === 'CHECKING_LOCATION' && <div className="card"><span className="spin" />Meminta lokasi...</div>}
      {step === 'OPENING_CAMERA' && <div className="card"><span className="spin" />Membuka kamera...</div>}

      {(step === 'CAMERA_READY' || step === 'CAPTURING') && <>
        <div className="cam">
          <video ref={videoRef} playsInline muted />
          <div className="frame"><div className="scan" /></div>
        </div>
        <p className="info">Lokasi valid · Jarak Anda {geo?.distance} meter dari kantor (maks. {geo?.radius} meter)</p>
        <button className="btn" disabled={step === 'CAPTURING'} onClick={capture}>Ambil foto</button>
      </>}

      {(step === 'PHOTO_READY' || step === 'UPLOADING' || (step === 'ERROR' && photo)) && <div className="card">
        <h2>Konfirmasi absensi</h2>
        <div className="cam" style={{ aspectRatio: '4/5' }}><img src={photo} alt="Foto selfie" /></div>
        <div className="status"><span>{auth.user.name}</span><span className="muted">{auth.user.id}</span></div>
        <div className="status"><span>Lokasi</span><span className="pill ok">Valid · {geo?.distance} meter</span></div>
        <div className="status"><span>Waktu foto</span><span>{shotAt}</span></div>
        {err && <div className="err">{err}</div>}
        <div className="row">
          <button className="btn ghost" disabled={step === 'UPLOADING'} onClick={() => { setPhoto(''); setErr(''); openCamera(); }}>Ulangi</button>
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
      <button className="back" onClick={() => setView('dashboard')}>‹ Kembali</button>
      <h2>Riwayat absensi</h2>
      <div className="card">
        {hist.length === 0 ? <p className="muted">Belum ada riwayat absensi.</p> :
          <table><thead><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th></tr></thead>
            <tbody>{hist.map(h => <tr key={h.date}><td>{h.date}</td><td>{h.checkIn || '-'}</td><td>{h.checkOut || '-'}</td></tr>)}</tbody></table>}
      </div>
    </>
  );

  /* ---------- DASHBOARD ---------- */
  const goHistory = async () => {
    setView('history'); setHist([]);
    const r = await get({ action: 'history', employeeId: auth.user.id, token: auth.token });
    if (r.success) setHist(r.data);
  };
  return (
    <>
      <p className="muted">{tgl(now)}</p>
      <h1>Selamat {sapa(now)}, {auth?.user?.name}</h1>
      <p className="clock">{jam(now)}</p>
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
