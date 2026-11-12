import { t } from '../../../shared/i18n';

export class Pronunciation {
  private audio?: HTMLAudioElement;
  private sequence = 0;

  stop() {
    this.sequence++;
    this.audio?.pause();
    this.audio = undefined;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  async play(word: string, language: string, recording: string, setStatus: (status: string) => void) {
    this.stop();
    const sequence = this.sequence;
    setStatus('');
    if (recording) {
      const audio = new Audio(recording);
      this.audio = audio;
      try { await audio.play(); return; } catch { audio.pause(); }
      if (sequence !== this.sequence || this.audio !== audio) return;
    }
    if (!('speechSynthesis' in window)) { setStatus(t('speech_unavailable')); return; }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = language;
    const voice = window.speechSynthesis.getVoices().find(candidate => candidate.lang.toLowerCase().startsWith(language.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onerror = event => {
      if (sequence === this.sequence && event.error !== 'canceled' && event.error !== 'interrupted') setStatus(t('speech_error'));
    };
    window.speechSynthesis.speak(utterance);
  }
}
