import { useId } from 'react';

export function Dot({
  mood = 'idle',
  small = false,
}: {
  mood?: 'idle' | 'thinking' | 'happy';
  small?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`dot-character dot-${mood} ${small ? 'dot-small' : ''}`}
      viewBox="0 0 240 210"
      role="img"
      aria-label={mood === 'happy' ? 'うれしそうに応援するdots' : 'そばで見守るdots'}
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="28%" r="80%">
          <stop stopColor="#f0f9ba" />
          <stop offset=".6" stopColor="#daee9e" />
          <stop offset="1" stopColor="#bed676" />
        </radialGradient>
      </defs>
      <ellipse
        className="dot-shadow"
        cx="121"
        cy="187"
        rx="57"
        ry="8"
        fill="#21372a"
        opacity=".09"
      />
      <g className="dot-body">
        <path
          className="dot-arm dot-arm-left"
          d="M65 116 Q35 110 33 91"
          fill="none"
          stroke="#c5df87"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          className="dot-arm dot-arm-right"
          d="M180 117 Q203 109 207 87"
          fill="none"
          stroke="#c5df87"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M48 109 C48 58 75 26 119 25 C163 24 194 60 193 110 C192 157 167 181 120 182 C74 183 48 155 48 109Z"
          fill={`url(#${id})`}
        />
        <ellipse cx="96" cy="101" rx="21" ry="26" fill="#fffff3" />
        <ellipse cx="147" cy="101" rx="21" ry="26" fill="#fffff3" />
        <g className="dot-eyes">
          <ellipse cx="100" cy="104" rx="9" ry="13" fill="#263d2d" />
          <ellipse cx="143" cy="104" rx="9" ry="13" fill="#263d2d" />
          <circle cx="103" cy="99" r="3" fill="white" />
          <circle cx="146" cy="99" r="3" fill="white" />
        </g>
        <ellipse cx="77" cy="128" rx="10" ry="5" fill="#e3b88d" opacity=".5" />
        <ellipse cx="164" cy="128" rx="10" ry="5" fill="#e3b88d" opacity=".5" />
        <path
          d={mood === 'happy' ? 'M109 134 Q120 155 132 134Z' : 'M113 136 Q120 142 128 135'}
          fill={mood === 'happy' ? '#355032' : 'none'}
          stroke="#355032"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      {mood === 'happy' && (
        <g className="dot-sparkles" fill="#c0d779">
          <path d="M28 35l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" />
          <path d="M213 36l2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" />
          <circle cx="200" cy="155" r="4" />
        </g>
      )}
    </svg>
  );
}
