import './globals.css';
import { Sora } from 'next/font/google';
const sora = Sora({ subsets: ['latin'], display: 'swap' });
export const metadata = { title: 'Absensi', description: 'Absensi GPS & Selfie' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#04223f' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id"><body className={sora.className}>
      <div className="sea" aria-hidden="true">
        <svg className="wave w1" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 60 Q150 0 300 60 T600 60 T900 60 T1200 60 V120 H0Z" /></svg>
        <svg className="wave w2" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 70 Q150 20 300 70 T600 70 T900 70 T1200 70 V120 H0Z" /></svg>
      </div>
      <main>{children}</main>
    </body></html>
  );
}
