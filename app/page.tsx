'use client';

import { useEffect, useState } from 'react';
import App from '../src/App';

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <App /> : <main aria-busy="true">dots &amp; signs を準備しています…</main>;
}
