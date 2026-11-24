type SpeechPriority = 'navigation' | 'poi';
type SpeechLang = 'nl' | 'en' | 'de' | 'fr';

const BCP47_MAP: Record<SpeechLang, string> = {
  nl: 'nl-NL',
  en: 'en-GB',
  de: 'de-DE',
  fr: 'fr-FR',
};

interface QueuedSpeech {
  text: string;
  priority: SpeechPriority;
  rate: number;
  lang: SpeechLang;
}

class AudioService {
  private audioCtx: AudioContext | null = null;
  private queue: QueuedSpeech[] = [];
  private isSpeaking = false;
  private voices: SpeechSynthesisVoice[] = [];
  private speakingListeners = new Set<(speaking: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  private pickVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
    if (this.voices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
    }
    const target = BCP47_MAP[lang].toLowerCase();
    return (
      this.voices.find((v) => v.lang.toLowerCase() === target && v.localService) ||
      this.voices.find((v) => v.lang.toLowerCase().startsWith(lang) && v.localService) ||
      this.voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ||
      this.voices[0] ||
      null
    );
  }

  /** Must be called inside a user click/tap handler to unlock audio on iOS Safari */
  public unlock(): void {
    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor && !this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if ('speechSynthesis' in window) {
        // Warm up speech synthesis on iOS
        const warm = new SpeechSynthesisUtterance('');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      }
    } catch {
      // Ignore audio unlock errors on restricted devices
    }
  }

  /** Play a pleasant two-tone bell chime when approaching a POI */
  public playPoiChime(): void {
    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const notes = [
        { freq: 880, start: 0, duration: 0.22 }, // A5
        { freq: 1174.66, start: 0.14, duration: 0.36 }, // D6
      ];

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        gain.gain.setValueAtTime(0.001, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.24, now + note.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration + 0.02);
      }
    } catch {
      // Ignore audio errors
    }
  }

  /** Enqueue speech; navigation instructions take priority over POI stories */
  public speak(text: string, priority: SpeechPriority, rate = 1.0, lang: SpeechLang = 'nl'): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = text.trim();
    if (!clean) return;

    if (priority === 'navigation') {
      window.speechSynthesis.cancel();
      this.queue = this.queue.filter((item) => item.priority === 'navigation');
      this.queue.unshift({ text: clean, priority, rate, lang });
      this.isSpeaking = false;
      this.processQueue();
    } else {
      this.queue.push({ text: clean, priority, rate, lang });
      if (!this.isSpeaking) {
        this.processQueue();
      }
    }
  }

  /** Immediately read a POI aloud when user taps "Lees voor" */
  public speakPoiNow(text: string, rate = 1.0, lang: SpeechLang = 'nl'): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    this.queue = [{ text: text.trim(), priority: 'poi', rate, lang }];
    this.isSpeaking = false;
    this.processQueue();
  }

  public stopSpeaking(): void {
    this.queue = [];
    this.isSpeaking = false;
    this.notifyListeners(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public onSpeakingChange(cb: (speaking: boolean) => void): () => void {
    this.speakingListeners.add(cb);
    return () => this.speakingListeners.delete(cb);
  }

  private notifyListeners(speaking: boolean) {
    this.speakingListeners.forEach((cb) => cb(speaking));
  }

  private processQueue(): void {
    if (this.isSpeaking || this.queue.length === 0) {
      if (!this.isSpeaking) this.notifyListeners(false);
      return;
    }

    const next = this.queue.shift()!;
    const utterance = new SpeechSynthesisUtterance(next.text);
    utterance.lang = BCP47_MAP[next.lang];
    utterance.rate = Math.min(1.5, Math.max(0.7, next.rate));
    const voice = this.pickVoice(next.lang);
    if (voice) {
      utterance.voice = voice;
    }

    this.isSpeaking = true;
    this.notifyListeners(true);

    utterance.onend = () => {
      this.isSpeaking = false;
      this.processQueue();
    };
    utterance.onerror = () => {
      this.isSpeaking = false;
      this.processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }
}

export const audioService = new AudioService();
