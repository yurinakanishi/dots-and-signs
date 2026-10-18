import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import blueBody from '../assets/dots/blue-body.png';
import greenBody from '../assets/dots/green-body.png';
import yellowBody from '../assets/dots/yellow-body.png';
import pinkBody from '../assets/dots/pink-body.png';
import './Dot.css';

export type DotColor = 'blue' | 'green' | 'yellow' | 'pink';
const characters = {
  blue: { body: blueBody, name: 'ベレー帽の青いdots', step: 2, offset: 70 },
  green: { body: greenBody, name: '大きな目の緑のdots', step: 1, offset: 20 },
  yellow: { body: yellowBody, name: '丸眼鏡の黄色いdots', step: 2, offset: 0 },
  pink: { body: pinkBody, name: 'サングラスのピンクのdots', step: 3, offset: 70 },
};

const Artwork = memo(function Artwork({ color }: { color: DotColor }) {
  const id = useId();
  const character = characters[color];
  return (
    <svg viewBox="0 0 1280 1280" className="dot-artwork" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-eye`} cx="35%" cy="25%" r="75%">
          <stop stopColor="#fff" />
          <stop offset=".65" stopColor="#fbfcf3" />
          <stop offset="1" stopColor="#aeb5a0" />
        </radialGradient>
        <linearGradient id={`${id}-black`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#333535" />
          <stop offset="1" stopColor="#080b0c" />
        </linearGradient>
      </defs>
      <image href={character.body} x="0" y={character.offset} width="1280" height="1280" />
      {color === 'blue' && (
        <>
          <g className="dot-accessory dot-beret">
            <path
              d="M181 537 Q118 513 184 410 Q263 278 561 249 Q777 220 910 317 Q972 373 896 426 Q579 430 291 548 Q221 573 181 537Z"
              fill={`url(#${id}-black)`}
            />
            <path
              d="M200 489 Q460 337 848 341"
              fill="none"
              stroke="#555855"
              strokeWidth="7"
              opacity=".35"
            />
            <ellipse
              cx="546"
              cy="251"
              rx="45"
              ry="53"
              fill="#191d1b"
              transform="rotate(-13 546 251)"
            />
          </g>
          <g className="dot-gaze">
            <g className="dot-blink">
              <ellipse cx="620" cy="805" rx="39" ry="69" fill="#080e13" />
              <ellipse cx="825" cy="795" rx="39" ry="69" fill="#080e13" />
              <ellipse cx="608" cy="779" rx="9" ry="17" fill="#fff" opacity=".28" />
              <ellipse cx="813" cy="769" rx="9" ry="17" fill="#fff" opacity=".28" />
            </g>
          </g>
        </>
      )}
      {color === 'green' && (
        <g className="dot-eyestalks">
          <g className="dot-blink">
            {[430, 835].map((x) => (
              <g key={x}>
                <ellipse cx={x} cy="464" rx="134" ry="153" fill="#5d9218" opacity=".38" />
                <ellipse cx={x} cy="442" rx="125" ry="145" fill={`url(#${id}-eye)`} />
                <g className="dot-gaze">
                  <ellipse cx={x + 21} cy="457" rx="68" ry="90" fill="#101712" />
                  <ellipse cx={x + 4} cy="425" rx="19" ry="26" fill="#fff" opacity=".86" />
                </g>
              </g>
            ))}
          </g>
        </g>
      )}
      {color === 'yellow' && (
        <>
          <g className="dot-gaze">
            <g className="dot-blink">
              <ellipse cx="510" cy="754" rx="28" ry="51" fill="#242112" />
              <ellipse cx="856" cy="754" rx="28" ry="51" fill="#242112" />
            </g>
          </g>
          <g className="dot-accessory dot-glasses" fill="none" stroke="#292a23" strokeWidth="25">
            <ellipse cx="492" cy="742" rx="147" ry="179" fill="#fff" fillOpacity=".035" />
            <ellipse cx="846" cy="742" rx="147" ry="179" fill="#fff" fillOpacity=".035" />
            <path d="M638 735 Q668 702 700 735 M345 718 L294 705 M992 718 L1024 705" />
            <path
              d="M413 640 Q430 614 459 611 M764 640 Q781 614 810 611"
              stroke="#fff"
              strokeWidth="13"
              opacity=".38"
              strokeLinecap="round"
            />
          </g>
        </>
      )}
      {color === 'pink' && (
        <>
          <g className="dot-gaze">
            <g className="dot-blink">
              <ellipse cx="430" cy="795" rx="34" ry="59" fill="#241026" />
              <ellipse cx="853" cy="795" rx="34" ry="59" fill="#241026" />
            </g>
          </g>
          <g
            className="dot-accessory dot-sunglasses"
            fill={`url(#${id}-black)`}
            stroke="#111316"
            strokeWidth="25"
          >
            <path d="M275 765 L220 747 M585 790 Q640 765 700 790 M1007 765 L1065 747" fill="none" />
            <ellipse cx="430" cy="800" rx="155" ry="168" />
            <ellipse cx="853" cy="800" rx="155" ry="168" />
            <path
              d="M340 742 Q357 711 390 702 M764 742 Q781 711 814 702"
              fill="none"
              stroke="#fff"
              strokeWidth="13"
              opacity=".13"
              strokeLinecap="round"
            />
          </g>
        </>
      )}
    </svg>
  );
});

type Reaction = { pose: 'idle' | 'pressed' | 'jump'; sequence: number; step: number };
const resting: Reaction = { pose: 'idle', sequence: 0, step: 0 };

/** Each dot owns its interaction; touching one never advances the sign lesson. */
export const Dot = memo(function Dot({
  color,
  achievement = 0,
}: {
  color: DotColor;
  achievement?: number;
}) {
  const [reaction, setReaction] = useState<Reaction>(resting);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const previousAchievement = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    pressed.current = false;
    setReaction((old) => ({ ...old, pose: 'idle', step: 0 }));
  }, []);
  const jump = useCallback((step = 0) => {
    window.clearTimeout(timer.current);
    pressed.current = false;
    setReaction((old) => ({ pose: 'jump', sequence: old.sequence + 1, step }));
    timer.current = window.setTimeout(
      () => {
        setReaction((old) => ({ ...old, pose: 'idle', step: 0 }));
      },
      step ? 1800 : 1150,
    );
  }, []);

  useEffect(() => {
    const previous = previousAchievement.current;
    previousAchievement.current = achievement;
    if (achievement === 0) clear();
    else if (
      achievement > previous &&
      (achievement === 3 || achievement === characters[color].step)
    )
      jump(achievement);
  }, [achievement, color, clear, jump]);

  useEffect(() => {
    const pause = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', pause);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', pause);
    };
  }, [clear]);

  function press() {
    window.clearTimeout(timer.current);
    pressed.current = true;
    setReaction((old) => ({ ...old, pose: 'pressed', step: 0 }));
  }
  function look(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch' || !event.isPrimary) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5));
    event.currentTarget.style.setProperty('--gaze-x', `${x * 45}px`);
    event.currentTarget.style.setProperty('--gaze-y', `${y * 28}px`);
  }

  return (
    <button
      ref={button}
      type="button"
      className={`dot-character dot-${color} dot-${reaction.pose}${reaction.step ? ' dot-reward' : ''}`}
      aria-label={`${characters[color].name}を押してはずませる`}
      data-reaction={reaction.sequence}
      data-achievement={achievement}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
      }}
      onPointerMove={look}
      onPointerUp={(event) => {
        if (!event.isPrimary || !pressed.current) return;
        jump();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={clear}
      onLostPointerCapture={() => {
        if (pressed.current) clear();
      }}
      onPointerLeave={() => {
        button.current?.style.setProperty('--gaze-x', '0px');
        button.current?.style.setProperty('--gaze-y', '0px');
      }}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) press();
      }}
      onClick={(event) => {
        if (event.detail === 0) jump();
      }}
      onBlur={() => {
        if (pressed.current) clear();
      }}
    >
      <span className="dot-shadow" aria-hidden="true" />
      <span className="dot-body" key={reaction.sequence}>
        <span className="dot-breath">
          <Artwork color={color} />
        </span>
      </span>
      {reaction.pose === 'jump' && (
        <span className="dot-surprise" key={`reward-${reaction.sequence}`} aria-hidden="true">
          <span className="dot-bubble">
            {reaction.step === 3
              ? 'やったね！'
              : reaction.step
                ? `${reaction.step}つできた！`
                : 'ぽよん！'}
          </span>
          <span className="dot-confetti">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
      <span className="dot-touch-hint" aria-hidden="true">
        押して、ぽよん
      </span>
    </button>
  );
});
