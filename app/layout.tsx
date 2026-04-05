import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import TopBar from '@/components/layout/TopBar';
import Sidebar from '@/components/layout/Sidebar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TALARIA',
  description: 'Personal Financial Intelligence Dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="font-sans antialiased">
        <TopBar />
        <Sidebar />
        <main className="ml-16 mt-14 min-h-screen bg-background p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
