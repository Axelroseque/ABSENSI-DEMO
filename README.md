# Absensi GPS & Selfie

- app/, lib/, public/, package.json -> frontend Next.js (Vercel, package.json di ROOT repo)
- apps-script/Code.gs -> backend Google Apps Script

## Apps Script
1. Paste Code.gs, run setup() once.
2. Deploy > Manage deployments > Edit > Version: **New version** > Deploy (wajib setiap kode berubah).
3. Edit manual sheet Employees/Settings? Jalankan clearCache() (atau tunggu 5-10 menit).

## Vercel
Framework: Next.js, Output Directory kosong, env NEXT_PUBLIC_API_URL = URL /exec.
