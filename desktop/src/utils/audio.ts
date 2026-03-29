let sharedAudioCtx: AudioContext | null = null;

export function initGlobalAudioContext() {
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
  } catch (e) {
    console.error("Failed to init global audio context", e);
  }
}

/**
 * Simple oscillator beep for join/leave notifications.
 */
export function playNotificationSound(type: 'join' | 'leave') {
  if (!sharedAudioCtx || sharedAudioCtx.state !== 'running') return;
  try {
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);

    if (type === 'join') {
      osc.frequency.setValueAtTime(400, sharedAudioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, sharedAudioCtx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(600, sharedAudioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, sharedAudioCtx.currentTime + 0.1);
    }

    gain.gain.setValueAtTime(0.05, sharedAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, sharedAudioCtx.currentTime + 0.1);

    osc.start();
    osc.stop(sharedAudioCtx.currentTime + 0.1);
  } catch (_) {
    // Audio context might be blocked by browser policy before interaction
  }
}

/** Build a DDragon champion portrait URL */
export const champImgUrl = (champ: string) =>
  `https://ddragon.leagueoflegends.com/cdn/14.5.1/img/champion/${champ}.png`;
