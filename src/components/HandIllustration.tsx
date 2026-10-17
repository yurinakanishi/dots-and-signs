import { useEffect, useState } from 'react';
import type { SignId } from '../lib/types';

/** An original schematic, not a recording or a reference dataset for recognition. */
export function HandIllustration({
  sign,
  playing = true,
  left = false,
  ghost = false,
}: {
  sign: SignId;
  playing?: boolean;
  left?: boolean;
  ghost?: boolean;
}) {
  const [bend, setBend] = useState(0);
  useEffect(() => {
    if (sign !== '10' || !playing || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBend(0);
      return;
    }
    let raf: number;
    const tick = (time: number) => {
      const t = (time % 3300) / 3300;
      setBend(t < 0.35 ? 0 : t < 0.6 ? (t - 0.35) / 0.25 : t < 0.85 ? 1 : (1 - t) / 0.15);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sign, playing]);
  const count = sign === '5' ? 0 : sign === '10' ? 1 : Number(sign);
  const paths = [
    count >= 1
      ? `M107 198 L105 129 Q103 109 107 ${70 + bend * 44} Q109 ${60 + bend * 58} 113 ${71 + bend * 96}`
      : 'M108 201 L108 169 Q108 155 117 162 L122 188',
    count >= 2
      ? 'M140 195 L141 62 Q141 50 145 61 L148 179'
      : 'M141 201 L141 168 Q142 156 151 164 L155 190',
    count >= 3
      ? 'M171 198 L178 81 Q179 68 184 81 L179 187'
      : 'M171 206 L174 177 Q176 164 183 174 L183 196',
    count >= 4
      ? 'M199 215 L212 117 Q214 107 218 119 L210 210'
      : 'M198 216 L202 194 Q204 182 210 192 L208 215',
  ];
  const stroke = ghost ? '#7c9080' : '#657b51';
  const fill = ghost ? '#e6ece3' : '#f1f4d7';
  return (
    <svg
      className={`hand-illustration ${ghost ? 'hand-ghost' : ''}`}
      viewBox="20 35 240 280"
      role="img"
      aria-label={`数字${sign}の手の形${sign === '10' ? '。人差し指を伸ばしてから曲げる' : ''}`}
    >
      <g transform={left ? 'translate(280 0) scale(-1 1)' : undefined}>
        <path
          d="M111 300 L105 264 Q82 248 91 199 Q95 181 111 187 L192 197 Q213 208 208 241 Q207 261 185 278 L183 300"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
        {paths.map((d, i) => (
          <g key={i}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth="26"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={d}
              fill="none"
              stroke={fill}
              strokeWidth="21"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}
        <path
          d="M103 212 Q145 194 199 217 L198 250 Q187 272 164 279 L115 273 Q98 250 103 212"
          fill={fill}
        />
        <path
          d={
            sign === '5'
              ? 'M108 249 Q92 232 62 228 L40 225'
              : 'M105 250 Q93 232 100 218 Q105 211 116 216 L144 230'
          }
          fill="none"
          stroke={stroke}
          strokeWidth="29"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={
            sign === '5'
              ? 'M108 249 Q92 232 62 228 L40 225'
              : 'M105 250 Q93 232 100 218 Q105 211 116 216 L144 230'
          }
          fill="none"
          stroke={fill}
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M134 251 Q150 246 164 252 M119 280 Q147 285 175 279"
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".35"
        />
      </g>
      {sign === '10' && (
        <g fill="none" stroke="#94a868" strokeWidth="2.5" strokeLinecap="round">
          <path d="M54 87 Q37 122 63 151" />
          <path d="M51 148 L64 152 L65 138" />
        </g>
      )}
    </svg>
  );
}
