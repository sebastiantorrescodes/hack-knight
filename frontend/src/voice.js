// How loud the plant's voice is right now (0-1), read by the 3D plant every frame to move its mouth.
// Whatever is speaking (the live call or a read-aloud reply) registers a source; nothing re-renders.

let source = null;

/** Make `fn` (returns 0-1) the current voice. Returns a function that removes it again. */
export function setVoiceSource(fn) {
  source = fn;
  return () => {
    if (source === fn) source = null;
  };
}

export function voiceLevel() {
  try {
    return source ? Math.min(1, Math.max(0, source() || 0)) : 0;
  } catch {
    return 0;
  }
}

let audioContext = null;

/**
 * Play an <audio> element and report its loudness as the voice while it plays. The audio must be CORS-enabled
 * (crossOrigin = "anonymous", which the backend allows); otherwise the browser would hide the samples.
 */
export function playWithVoice(audio) {
  try {
    audioContext ??= new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaElementSource(audio).connect(analyser);
    analyser.connect(audioContext.destination);
    const samples = new Uint8Array(analyser.fftSize);
    const level = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      return Math.sqrt(sum / samples.length) * 4; // speech RMS sits around 0.05-0.25
    };
    const stop = setVoiceSource(level);
    for (const event of ["ended", "pause", "error"]) audio.addEventListener(event, stop);
    audioContext.resume().catch(() => {});
  } catch {
    // No Web Audio: the voice still plays, the mouth just doesn't move
  }
  return audio.play();
}
