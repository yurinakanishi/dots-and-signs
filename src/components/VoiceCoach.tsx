import { Mic, LoaderCircle, ArrowRight, Volume2, LayoutGrid } from 'lucide-react';
import type { useLiveCoach } from '../hooks/useLiveCoach';
import { lessons, lessonNames } from '../lib/lessons';

export function VoiceCoach({
  coach,
  onSelectMode,
}: {
  coach: ReturnType<typeof useLiveCoach>;
  onSelectMode: () => void;
}) {
  const connected = coach.state === 'listening';
  const connecting = coach.state === 'connecting';
  const proposed = lessons.find((lesson) => lesson.id === coach.recommendedLessonId);
  const hasConversation = Boolean(
    connected ||
    connecting ||
    coach.stopping ||
    coach.inputTranscript ||
    coach.outputTranscript ||
    coach.error ||
    coach.notice,
  );
  const microphoneOn = (connected || connecting) && !coach.stopping;
  return (
    <section
      className={`voice-coach${hasConversation ? ' voice-open' : ''}`}
      aria-labelledby="voice-heading"
    >
      <div className="voice-heading">
        <div className="voice-intro">
          <span className="voice-icon" aria-hidden="true">
            <Mic size={19} />
          </span>
          <div>
            <h2 id="voice-heading">伝えたいひとことを、話してみよう</h2>
            <p>音声入力をONにして、練習したいことばを話してね。</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="音声入力"
          aria-checked={microphoneOn}
          aria-describedby="voice-privacy"
          className="microphone-toggle"
          disabled={coach.stopping}
          onClick={() => (microphoneOn ? coach.stop() : void coach.start())}
        >
          {coach.stopping ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <span className="microphone-switch-track" aria-hidden="true">
              <i />
            </span>
          )}
          <span>
            音声入力 <strong>{microphoneOn ? 'ON' : 'OFF'}</strong>
          </span>
        </button>
      </div>
      <p className="voice-privacy" id="voice-privacy">
        ONにするとマイク音声をOpenAIへ送信します（有料・1回1分／1日10回まで）。OFFにすると接続を終了します。カメラ映像は端末内で処理します。
      </p>
      {hasConversation && (
        <div className="voice-content">
          <div className="voice-session-status" role="status">
            <span className={connected && !coach.stopping ? 'voice-live' : ''}>
              <i aria-hidden="true" />
              {coach.stopping
                ? '接続を終了中'
                : connecting
                  ? 'マイクと接続を準備しています…'
                  : connected
                    ? 'お話しください'
                    : '音声入力はOFFです'}
            </span>
            {connected && !coach.stopping && <small>1回1分まで · OFFにすると終了します</small>}
          </div>
          {coach.error && (
            <p className="voice-error" role="alert">
              {coach.error}
            </p>
          )}
          {coach.playbackBlocked && (
            <button className="text-button" onClick={() => void coach.resumeAudio()}>
              <Volume2 size={17} />
              コーチの音声を再生する
            </button>
          )}
          {(connected || coach.inputTranscript || coach.outputTranscript) && (
            <div className="voice-transcripts" aria-label="会話の字幕">
              <div>
                <h3>あなた</h3>
                <p>{coach.inputTranscript || '話した内容がここに表示されます。'}</p>
              </div>
              <div>
                <h3>dots コーチ</h3>
                <p aria-live="polite">
                  {coach.outputTranscript || 'コーチの言葉がここに表示されます。'}
                </p>
              </div>
            </div>
          )}
          {proposed && (
            <div className="voice-recommendation" role="status">
              <div>
                <span>このことばから始めましょう</span>
                <strong>{proposed.label}</strong>
                {proposed.practiceNote && (
                  <p className="voice-proposal-note">{proposed.practiceNote}</p>
                )}
              </div>
              <div className="voice-confirm-actions">
                <button
                  className="voice-button"
                  disabled={Boolean(coach.awaitingDisplay)}
                  onClick={() => coach.confirmLesson(proposed.id)}
                >
                  このことばを練習する
                  <ArrowRight size={16} />
                </button>
                <button className="text-button" onClick={coach.dismissRecommendation}>
                  今は変えない
                </button>
              </div>
            </div>
          )}
          {coach.recommendedLessonId === 'none' && (
            <p className="voice-unsupported" role="status">
              この文章の手話はまだ教材化していません。今は{lessonNames}を選べます。
            </p>
          )}
          {coach.recommendedLessonId === 'unclear' && (
            <p className="voice-notice" role="status">
              練習したいことばを、もう一度1つだけ話してね。「こんにちは」だけでも選べるよ。
            </p>
          )}
          {coach.notice && !coach.error && (
            <p className="voice-notice" role="status">
              {coach.notice}
            </p>
          )}
        </div>
      )}
      <div className="voice-fallback">
        <span>うまく聞き取れないときは、画像から選べます。</span>
        <button className="text-button" onClick={onSelectMode}>
          <LayoutGrid size={16} />
          選択モードに切り替える
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
