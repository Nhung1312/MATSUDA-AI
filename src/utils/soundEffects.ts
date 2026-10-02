/**
 * Web Audio API Sound Effects for Toán THCS
 * Hoạt động 100% offline, không cần tải file mp3, phản hồi tức thì dưới 1ms.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const savedMuted = localStorage.getItem('toan_thcs_sound_muted');
      if (savedMuted !== null) {
        this.muted = savedMuted === 'true';
      }
    } catch {}
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('toan_thcs_sound_muted', muted ? 'true' : 'false');
    } catch {}
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playSelect();
    }
    return this.muted;
  }

  /**
   * Âm thanh chọn đáp án (Pop / Bubble êm ái)
   */
  public playSelect(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Tần số trượt từ 480Hz lên 750Hz tạo cảm giác bubble pop sảng khoái
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.07);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {}
  }

  /**
   * Âm thanh chuyển câu hỏi (Lật trang / Nhịp click nhẹ nhàng)
   */
  public playNavigate(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {}
  }

  /**
   * Âm thanh gắn cờ / đánh dấu xem lại (Chuông đôi chime thanh tao)
   */
  public playFlag(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Nốt 1: 659Hz (E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.14, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.19);

      // Nốt 2: 987Hz (B5) sau 60ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.06);
      gain2.gain.setValueAtTime(0.14, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.26);
    } catch {}
  }

  /**
   * Âm cảnh báo thời gian thi sắp hết (Tick gõ nhẹ)
   */
  public playTick(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }

  /**
   * Âm thanh nộp bài thành công (Hợp âm Fanfare chúc mừng rực rỡ C-E-G-C)
   */
  public playSuccess(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const duration = 0.12;

      notes.forEach((freq, idx) => {
        const noteStart = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.15, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + duration + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + duration + 0.16);
      });
    } catch {}
  }

  /**
   * Âm thanh click nhẹ nhàng / phím bấm máy tính / thao tác vẽ nháp
   */
  public playClick(): void {
    this.playTick();
  }
}

export const soundEffects = new SoundEngine();
