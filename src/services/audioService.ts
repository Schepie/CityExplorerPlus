import type { VoiceGender, VoiceRegion } from '../types';

type SpeechPriority = 'navigation' | 'poi';
type SpeechLang = 'nl' | 'en' | 'de' | 'fr';

const FEMALE_VOICE_HINTS =
  /\b(ellen|claire|fenna|colette|dena|lotte|saskia|flo|sandy|shelley|female|vrouw|woman)\b/i;
const MALE_VOICE_HINTS =
  /\b(xander|maarten|arnaud|frank|ruben|eddy|reed|rocko|grandpa|male|man)\b/i;

export interface VoicePreference {
  voiceRegion: VoiceRegion;
  voiceGender: VoiceGender;
  preferredVoiceURI: string;
}

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
  private voicesListeners = new Set<(voices: SpeechSynthesisVoice[]) => void>();
  private pref: VoicePreference = {
    voiceRegion: 'nl-BE',
    voiceGender: 'auto',
    preferredVoiceURI: '',
  };

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices();
        this.voicesListeners.forEach((cb) => cb(this.voices));
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  public configureVoice(pref: VoicePreference): void {
    this.pref = pref;
  }

  public getDutchVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
    }
    return this.voices
      .filter((v) => v.lang.toLowerCase().startsWith('nl'))
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  }

  public onVoicesChange(cb: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voicesListeners.add(cb);
    return () => this.voicesListeners.delete(cb);
  }

  private matchesGender(voice: SpeechSynthesisVoice, gender: VoiceGender): boolean {
    if (gender === 'auto') return true;
    if (gender === 'female') return FEMALE_VOICE_HINTS.test(voice.name);
    return MALE_VOICE_HINTS.test(voice.name);
  }

  private pickVoice(lang: SpeechLang): { voice: SpeechSynthesisVoice | null; pitch: number; bcp47: string } {
    if (this.voices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
    }

    if (lang !== 'nl') {
      const map: Record<Exclude<SpeechLang, 'nl'>, string> = {
        en: 'en-GB',
        de: 'de-DE',
        fr: 'fr-FR',
      };
      const target = map[lang];
      const match =
        this.voices.find((v) => v.lang.toLowerCase() === target.toLowerCase() && v.localService) ||
        this.voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ||
        null;
      return { voice: match, pitch: 1.0, bcp47: target };
    }

    const region = this.pref.voiceRegion; // 'nl-BE' or 'nl-NL'
    const regionLower = region.toLowerCase();
    const gender = this.pref.voiceGender;

    // 1. Exact user-selected device voice if set
    if (this.pref.preferredVoiceURI) {
      const exact = this.voices.find((v) => v.voiceURI === this.pref.preferredVoiceURI);
      if (exact) {
        return { voice: exact, pitch: 1.0, bcp47: exact.lang || region };
      }
    }

    const dutchVoices = this.voices.filter((v) => v.lang.toLowerCase().startsWith('nl'));
    const regionVoices = dutchVoices.filter((v) => v.lang.toLowerCase() === regionLower);

    // 2. Match both requested region (Vlaams / Nederlands) AND requested gender (Vrouw / Man)
    if (gender !== 'auto') {
      const exactRegionGender = regionVoices.find((v) => this.matchesGender(v, gender));
      if (exactRegionGender) {
        return { voice: exactRegionGender, pitch: 1.0, bcp47: region };
      }
      // 3. Fallback: match requested gender in any Dutch voice
      const anyDutchGender = dutchVoices.find((v) => this.matchesGender(v, gender));
      if (anyDutchGender) {
        return { voice: anyDutchGender, pitch: 1.0, bcp47: anyDutchGender.lang || region };
      }
    }

    // 4. Match requested region (prefer local service)
    const bestRegion =
      regionVoices.find((v) => v.localService) ||
      regionVoices[0] ||
      dutchVoices.find((v) => v.localService) ||
      dutchVoices[0] ||
      null;

    // Subtle pitch adjustment if user requested male/female but device only has 1 Dutch voice
    const pitch =
      gender === 'male' && bestRegion && !MALE_VOICE_HINTS.test(bestRegion.name)
        ? 0.86
        : gender === 'female' && bestRegion && MALE_VOICE_HINTS.test(bestRegion.name)
          ? 1.12
          : 1.0;

    return { voice: bestRegion, pitch, bcp47: region };
  }

  /** Must be called inside a user click/tap handler to unlock audio on iOS Safari */
  public unlock(): void {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor && !this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if ('speechSynthesis' in window) {
        const warm = new SpeechSynthesisUtterance('');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      }
    } catch {
      // Ignore audio unlock errors
    }
  }

  /** Play a pleasant two-tone bell chime when approaching a POI */
  public playPoiChime(): void {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
        { freq: 880, start: 0, duration: 0.22 },
        { freq: 1174.66, start: 0.14, duration: 0.36 },
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
    const picked = this.pickVoice(next.lang);
    const utterance = new SpeechSynthesisUtterance(next.text);
    utterance.lang = picked.bcp47;
    utterance.rate = Math.min(1.5, Math.max(0.7, next.rate));
    utterance.pitch = picked.pitch;
    if (picked.voice) {
      utterance.voice = picked.voice;
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
