# Main Starship & Tractor Beam Visuals 🛸

To evolve the central `main` branch into a massive mothership pulling in commits, we will replace the static background column with a custom retro sprite and implement a "Tractor Beam" data-teleportation effect.

## User Review Required

> [!IMPORTANT]
> Take a look at the NanoBanana generated sprite below. Let me know if you like this design, or if you want it to be wider, smaller, or a different color!

![Main Astronave](/home/riccardo/.gemini/antigravity/brain/9fe05ee7-8dca-4ee6-a1ce-658672ee3c78/git_astronave_1782760941075.png)

## Proposed Changes

### `html/engine.js`

#### 1. Replace the Main Column with the Sprite
- We will load `astronave_main.png` using the Javascript `Image` object.
- The `mainY` coordinate is already mathematically locked to `currentTime`. Because `currentTime` maps exactly to `y = mainY` in our parallax calculations, drawing the sprite centered at `mainY` perfectly fulfills your requirement: the time grid lines will cross the exact center of the ship the moment the date strikes midnight.

#### 2. The Tractor Beam Metaphor
Currently, we spawn `lasers` that travel as individual bullets. We will completely replace this with a Star Trek-style `TractorBeam` entity!
- When a branch ship makes a commit, the `main` mothership extends a glowing, semi-transparent conical beam towards it.
- **Google Colors**: The beam and its teleporting particles will randomly select from Google's palette: Blue (`#4285F4`), Red (`#EA4335`), Yellow (`#FBBC05`), and Green (`#34A853`).
- **Data Teleportation**: Instead of bullets shooting *at* the main ship, tiny glowing data packets will be drawn *down* the beam into the mothership's cargo hold.

## Verification Plan

### Manual Verification
1. I will load the sprite and rewrite the rendering loop to support drawing images.
2. I will implement the new Tractor Beam physics instead of laser bullet physics.
3. You will be able to play the timeline and watch the mothership suck in data packets via Google-colored tractor beams!
