import type { Feedback, LessonId } from './types';
import {
  HINT_INTERVAL_MS,
  HINT_SESSION_LIMIT,
  HINT_STALL_MS,
  HINT_TIMEOUT_MS,
  hintIsRelevant,
  isHintId,
  type HintContext,
  type HintId,
} from './practice-hints';

type Observation = { lessonId: LessonId; feedback: Feedback; active: boolean; run: number };
type Selection = { id: HintId; lessonId: LessonId; step: number; run: number; preparing: boolean };

export class PracticeHintController {
  private current: Observation | null = null;
  private key = '';
  private generation = 0;
  private progressedAt = 0;
  private requestedAt = -Infinity;
  private attempts = 0;
  private failures = 0;
  private blocked = false;
  private history: HintId[] = [];
  private hint: Selection | null = null;
  private expiresAt = 0;
  private pending: AbortController | null = null;
  private listeners = new Set<() => void>();
  private request: typeof fetch;
  private now: () => number;
  private visible: () => boolean;

  constructor(options: { fetch?: typeof fetch; now?: () => number; visible?: () => boolean } = {}) {
    // Native browser fetch must keep its Window receiver, not this controller.
    this.request = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? Date.now;
    this.visible = options.visible ?? (() => !document.hidden);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.hint;
  private display(hint: Selection | null) {
    if (this.hint === hint) return;
    this.hint = hint;
    this.listeners.forEach((listener) => listener());
  }
  private invalidate() {
    this.generation++;
    this.pending?.abort();
    this.pending = null;
    this.display(null);
  }
  observe(next: Observation) {
    const previous = this.current;
    const feedback = next.feedback;
    if (next.active && (!previous?.active || previous.run !== next.run)) {
      this.attempts = 0;
      this.failures = 0;
      this.blocked = false;
    }
    const key = `${next.active}:${next.run}:${next.lessonId}:${feedback.step}:${feedback.completedSteps}:${feedback.preparing}:${feedback.trackingPaused}:${feedback.status === 'success'}`;
    if (key !== this.key) {
      this.invalidate();
      this.key = key;
      this.history = [];
      this.progressedAt = this.now();
    } else if (previous && feedback.holdProgress > previous.feedback.holdProgress) {
      this.progressedAt = this.now();
    }
    this.current = next;
    if (this.hint && !hintIsRelevant(this.hint.id, { lessonId: next.lessonId, ...feedback }))
      this.display(null);
  }
  async tick() {
    const current = this.current;
    const now = this.now();
    if (now >= this.expiresAt) this.display(null);
    if (!this.visible()) {
      this.invalidate();
      return;
    }
    if (
      !current?.active ||
      current.feedback.status === 'success' ||
      current.feedback.trackingPaused ||
      this.pending ||
      this.blocked ||
      this.attempts >= HINT_SESSION_LIMIT ||
      now - this.progressedAt < HINT_STALL_MS ||
      now - this.requestedAt < HINT_INTERVAL_MS
    )
      return;

    const { feedback, lessonId } = current;
    const context: HintContext = {
      lessonId,
      step: feedback.step,
      handCount: feedback.handCount,
      bodyVisible: feedback.bodyVisible,
      holdProgress: feedback.holdProgress,
      preparing: feedback.preparing,
      stalledSeconds: Math.min(3600, Math.floor((now - this.progressedAt) / 1000)),
      previousHints: [...this.history],
    };
    const generation = this.generation;
    const abort = new AbortController();
    this.pending = abort;
    this.requestedAt = now;
    this.attempts++;
    const timer = setTimeout(() => abort.abort(), HINT_TIMEOUT_MS + 2000);
    try {
      const response = await this.request('/api/practice/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
        signal: abort.signal,
      });
      if (generation !== this.generation || abort.signal.aborted) return;
      if (!response.ok) {
        if ([400, 429, 503].includes(response.status)) this.blocked = true;
        throw new Error('hint_unavailable');
      }
      const data: unknown = await response.json();
      if (generation !== this.generation || abort.signal.aborted || !this.visible()) return;
      if (
        !data ||
        typeof data !== 'object' ||
        !('hint' in data) ||
        !isHintId(data.hint) ||
        !('source' in data) ||
        data.source !== 'decisions'
      )
        throw new Error('invalid_hint');
      const latest = this.current;
      if (
        !latest?.active ||
        !hintIsRelevant(data.hint, { lessonId: latest.lessonId, ...latest.feedback })
      )
        return;
      this.history = [...this.history, data.hint].slice(-3);
      this.failures = 0;
      this.expiresAt = this.now() + 12_000;
      this.display({
        id: data.hint,
        lessonId,
        step: feedback.step,
        run: current.run,
        preparing: feedback.preparing,
      });
    } catch {
      if (generation === this.generation) {
        this.failures++;
        if (this.failures >= 2) this.blocked = true;
      }
    } finally {
      clearTimeout(timer);
      if (this.pending === abort) this.pending = null;
    }
  }
  dispose = () => {
    this.invalidate();
    this.current = null;
    this.key = '';
  };
}
