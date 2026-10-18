import quartet from '../assets/dots-quartet.png';

export function Dot({ mood = 'idle' }: { mood?: 'idle' | 'thinking' | 'happy' }) {
  return (
    <div
      className={`dot-character dot-${mood}`}
      role="img"
      aria-label="ベレー帽の青、目の大きな緑、丸眼鏡の黄色、サングラスのピンクの4体のdots"
    >
      <img
        className="dot-body"
        src={quartet}
        width={2172}
        height={724}
        alt=""
        decoding="async"
        draggable={false}
      />
      {mood === 'happy' && (
        <span className="dot-sparkles" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
