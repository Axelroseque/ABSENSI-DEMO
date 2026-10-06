# Absensi GPS & Selfie

Struktur repo (package.json ada di ROOT repo):
- app/, lib/, public/, package.json  -> frontend Next.js (Vercel)
- apps-script/Code.gs                -> backend (paste ke Google Apps Script)

## Vercel
- Framework Preset: **Next.js** (vercel.json sudah mengaturnya)
- Root Directory: kosongkan / `./` (package.json ada di root repo)
- Output Directory: JANGAN diisi (biarkan default / matikan Override)
- Environment Variable: NEXT_PUBLIC_API_URL = URL Web App Apps Script (.../exec)

## Apps Script
Lihat komentar di bagian atas apps-script/Code.gs.
