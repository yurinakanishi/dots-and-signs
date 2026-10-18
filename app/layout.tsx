import type { ReactNode } from 'react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/noto-sans-jp';
import '../src/styles.css';

export const metadata = {
  title: 'dots & signs — 手話を、最初のひとことから。',
  icons: { icon: '/favicon.svg' },
  description: '「こんにちは」の手話を画像のお手本とカメラで練習できます。',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
