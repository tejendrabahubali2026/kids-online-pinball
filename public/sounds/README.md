# Audio assets — Space Pinball Blast

The game ships with **no third-party audio files**. Every sound effect and the
background music are synthesized at runtime with the Web Audio API, so the game
is fully playable and audible with this folder empty.

You can optionally drop in your own licensed files using the exact filenames
below. Each file is loaded individually; a missing or undecodable file silently
falls back to the synthesized version (no errors, no unhandled rejections).

## Required filenames (drop-in)

| File | Used for | Suggested length |
| --- | --- | --- |
| `bgm.mp3` | looping background music during play | 30–90 s seamless loop |
| `flipper.wav` | flipper snap | < 250 ms |
| `bumper.wav` | pop bumper / planet hit | < 400 ms |
| `launch.wav` | plunger launch | < 600 ms |
| `gameover.wav` | game-over jingle | 1–3 s |

## Optional extra filenames

`target.wav`, `sling.wav`, `drain.wav`, `orbit.wav`, `ramp.wav`,
`spinner.wav`, `lane.wav`, `lock.wav`, `jackpot.wav`, `multiball.wav`,
`stage.wav`, `extra.wav`, `save.wav`, `click.wav`

Keep SFX short (< 1 s) and normalized; MP3 or WAV both work. Keep total audio
under a few MB so the site stays quick to load.

## Where to find royalty-free audio (verify the licence yourself)

We could not verify redistribution rights for any specific track while building
this project, so **no audio files are committed** — committing assets whose
licence does not clearly allow redistribution would be wrong.

If you want to add files, search Pixabay (or another library that grants a clear
redistribution licence) and read the licence for the *specific* asset you
download. The current Pixabay Content License page is
<https://pixabay.com/service/license-summary/>. Do not assume Pixabay assets are
CC0 — check the individual asset page and its licence text before committing.

Useful Pixabay search pages:

- Cheerful kids game background music:
  <https://pixabay.com/music/search/cheerful%20kids%20game/>
- Arcade pinball flipper:
  <https://pixabay.com/sound-effects/search/pinball%20flipper/>
- Pinball bumper:
  <https://pixabay.com/sound-effects/search/pinball%20bumper/>
- Pinball launch:
  <https://pixabay.com/sound-effects/search/pinball%20launch/>
- Arcade game over:
  <https://pixabay.com/sound-effects/search/arcade%20game%20over/>

## Recording attribution

If you add a file, record its source here so the provenance stays auditable:

```
<filename> — "<asset title>" by <author>
Source: <direct asset URL>
Licence: <licence name + link>
Downloaded: <YYYY-MM-DD>
```

## Notes on playback

- Browsers block audio until the first user gesture; music starts after the
  player clicks Play / taps the screen.
- Music and SFX have independent mute toggles in the UI (stored in
  `localStorage` under `spb_prefs_v2`).
- Music is ducked while paused and the audio context is suspended while the tab
  is hidden.
