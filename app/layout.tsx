import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'視界協作 · VisionLink',description:'Android 貨品驗收、條碼核對與 Wonderland 3D／AR 協作'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="zh-Hant"><body style={{margin:0}}>{children}</body></html>;}
