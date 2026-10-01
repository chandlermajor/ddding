# dding-sound

<img src="dding-icon-256.png" width="96" alt="dding">

Give Kilo a mouth: when you're staring blankly at the screen, it speaks up and nudges you.

**Features**
- When you need to decide (`question` pops options) → three quick double beeps ✅ on by default
- Task done → a Final Fantasy-style victory fanfare, ~2.45s ✅ on by default
- An error occurred → descending minor tune ✅ on by default
- A permission is requested → two beeps (off by default, too noisy)
- Work begins → a soft blip (off by default)

The sounds are **synthesized in real time** by the plugin (plain Node writing WAV), so there are no audio assets and no npm dependencies; changing parameters takes effect immediately.

**Install**

After downloading and extracting from GitHub, run:

```bash
./install.sh
```

This copies the plugin to `~/.config/kilo/plugin/dding-sound.js` and generates a config template at
`~/.config/kilo/dding.json`. **Restart Kilo** afterward (`Developer: Reload Window` in VSCodium).

Once installed, you can **safely delete the source files** — the plugin is copied independently and no longer depends on the original repo.

**Development mode** (edits take effect immediately, no copying):

```bash
./install.sh --link
```

**Uninstall**

```bash
./install.sh --uninstall
```

**Preview sounds**

```bash
npm run preview          # plays all sound styles in turn
node scripts/preview.mjs done --wav --out /tmp/done.wav   # export a wav to listen to on your own
```

**Configuration**

Edit `~/.config/kilo/dding.json` (comments and trailing commas supported; restart Kilo after changing):

| key | default | description |
|---|---|---|
| `enabled` | `true` | master switch |
| `volume` | `0.55` | 0.0 ~ 1.0 |
| `decision.repeats` | `3` | how many times to repeat the decision prompt |
| `permission.enabled` | `false` | permission-ask sound (off by default) |
| `permissionImportantOnly` | `true` | only trigger for high-risk operations |
| `done.cooldownMs` | `20000` | minimum gap within the same session |
| `done.graceMs` | `2500` | must stay idle this long after finishing to count as done |
| `error.cooldownMs` | `20000` | error-prompt cooldown |
| `start.enabled` | `false` | work-begin prompt (off by default) |
| `startupChime` | `true` | startup self-check |
| `watchdog.enabled` | `true` | fallback judgment when there's no `session.status` |
| `currentProjectOnly` | `true` | only speak for this project's sessions |
| `mainSessionsOnly` | `true` | suppress subagent / Agent Manager sessions |
| `player` | `"auto"` | force a specific paplay / pw-play / ffplay / aplay |
| `debug` | `false` | log to `~/.config/kilo/dding.log` (512KB cap) |
| `tts.enabled` | `false` | text-to-speech narration, needs `sudo apt install espeak-ng` |

**Requirements**

- Node ≥ 20 (Kilo actually uses bun; the plugin itself has no dependencies)
- Any one audio player: `paplay` / `pw-play` / `ffplay` / `aplay`
  Auto-detects PulseAudio / PipeWire and silently degrades if none is found, without slowing Kilo down.
