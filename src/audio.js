let ctx = null
function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    ctx = new AudioCtx()
  }
  return ctx
}

function beep({ freq = 440, duration = 0.08, type = 'square', volume = 0.05, delay = 0, glideTo = null }) {
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime + delay)
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + delay + duration)
    }
    gain.gain.setValueAtTime(volume, c.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(c.currentTime + delay)
    osc.stop(c.currentTime + delay + duration)
  } catch (e) {
    // audio pode falhar antes de interação do usuário; ignora silenciosamente
  }
}

let chompToggle = false
export const sfx = {
  chomp() {
    chompToggle = !chompToggle
    beep({ freq: chompToggle ? 220 : 260, duration: 0.05, type: 'square', volume: 0.04 })
  },
  pellet() {
    beep({ freq: 180, duration: 0.15, type: 'sawtooth', volume: 0.06, glideTo: 90 })
  },
  eatGhost() {
    beep({ freq: 300, duration: 0.2, type: 'square', volume: 0.07, glideTo: 900 })
  },
  death() {
    beep({ freq: 500, duration: 0.5, type: 'sawtooth', volume: 0.08, glideTo: 60 })
  },
  start() {
    beep({ freq: 440, duration: 0.1, volume: 0.06, delay: 0 })
    beep({ freq: 550, duration: 0.1, volume: 0.06, delay: 0.12 })
    beep({ freq: 660, duration: 0.15, volume: 0.06, delay: 0.24 })
  },
  levelUp() {
    beep({ freq: 523, duration: 0.1, volume: 0.06, delay: 0 })
    beep({ freq: 659, duration: 0.1, volume: 0.06, delay: 0.1 })
    beep({ freq: 784, duration: 0.2, volume: 0.06, delay: 0.2 })
  },
  extraLife() {
    beep({ freq: 660, duration: 0.08, volume: 0.06, delay: 0 })
    beep({ freq: 880, duration: 0.2, volume: 0.06, delay: 0.09 })
  },
}
