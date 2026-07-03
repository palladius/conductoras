## Controls

Controls are like in a video:

1. Select repo dropdown, must be a repo with `~/git/$REPO_NAME/conductor/tracks/` folder existing. Since this takes some time, you can cache this value. Note that every repo will have a different history, so the JSON is parametric in reponame (or a deterministic hash of it). Default to `../media-arneis/` which has quite some tracks.
1. PLAY: starts animation from where we are.
1. PAUSE: Stops animation in the time we are now
1. RESET: resets timeline to 0. Ready for another play.
1. The Timeline bar: this is clickable with mouse and should set roughly the timeline from the first commit 
1. Date should be visualized like in a 1980s-style youtube, with counter on top right or left, out of sight, but always incrementing. Also #branches at a given time should be visible. More branches active at a given time should give us more visual complexity and more SCORE :)

PS. Ensure all visualized things don't overlap ;) Take screenshot every now and then to guarantee this.

## Branches

- [x] 1. Ignore Stashes
- [x] 2. **TAGS**. Maybe the TAGS should be some sort of horizontal line, saying "on day YYYMMDD we reached tag 1.01..." and scrolls vertically over it. Can we try it?
- [x] 3. Remove `[]` in branch names, if u need to classify add a Branch emoji in front.
- [x] 4. Remove the `[]` from the branches
- [x] 5. Is there a way to tie branches to Conductor status? If so, I'd like Conductor branches to be colored or emoji'ed or represented differently, maybe like the WAND of a wizard to simulate the magic of a conductor. In other words, I want NORMAL branches the current way, and CONDUCTOR branches the other wand, magical way.


## Speed of Animation

We need some way to signify the passing of time, maybe days or months have parallax implication, maybe a moon rotating on the bottom left/right and it becomes FULL every 1mo? Also time should be dilating if many branches in a day -> go slower, if nothing happens for a month -> go faster. This speed flexibility should be signified by external things, like sun, moon, or horizontal lines with vertical parallax (eg one semi transparent daily line, a visible weekly line, and a monthly thicker line with "Apr 2026" coming down). Do some experimentation.

## Main Starship (bottom center of the game)

Main should be a nice "sprite", maybe generated with NanoBanana with some sort of transparency so its not a stupid SQUARE/RECTANGLE. It should be some sort of "git starship" with "main" pixelated, but otherwise rounded and super cool. This starship sends super cool special effects using the best that JS has to offer, in google-themed colors. Similar to Star Trek teleporting with the idea of an "attracting ray beam" (a tractor beam); this is the metaphor we want to convey.

The vertical position of "main" starship is the position of `current_time()`. So for instance, if we're passing Jul 2026, when the line crosses the center of the starship, THEN the git repo has passed midnight of 1 jul 2026.

## Committer Characters & Playability

- **Spaceships as Committer Avatars (Characters)**: Spaceships represent individual **committers (players)** rather than git branches. 
  - Each developer is assigned a unique, vibrant neon color.
  - The spaceship's overhead label displays the developer's full **Name Surname** (from their git author details) instead of the branch name.
  - A developer's ship dynamically **spawns** on screen only when they make their first commit in the timeline.
  - When their branch is merged, their ship dives into the main mothership and deactivates. When they commit again, their ship dynamically reactivates and spawns at a new starting position.
- **Conductor Status**: If a player ever makes a "Conductor" commit, their spaceship shape transforms into a wizard wand (`🪄`) with a glowing tip and a custom star SVG, representing the "magic of a conductor". Otherwise, they fly standard Gyruss-style space fighters (`🌿`).

## Mission Briefing & HUD

- **HUD Counter**: The top HUD displays a real-time counter of unique **PLAYERS** (unique committers processed so far) next to the total commits counter.
- **Email Alias Merging**: Plus-address aliases (e.g., `user+alias@google.com`) are normalized by the parser to strip out sub-addressing suffixes. This ensures all aliases are merged into the same player, sharing the same spaceship, color, and avatar.
- **Mission Briefing Overlay (Pre-Start state)**: 
  - Upon loading a repo or resetting the timeline, the game enters a paused state and presents a retro, neon-themed overlay card.
  - It shows general statistics: **REPO NAME**, **TOTAL COMMITS**, and **ACTIVE COMMITTERS**.
  - It displays a scrollable grid of the player fleet. Each card contains the player's avatar, name, email, primary branch, and a visual preview (using the exact color and SVG geometry) of their assigned spaceship/wand.
  - Clicking **LAUNCH MISSION** or the HUD **PLAY** button hides the briefing card and runs/resumes the timeline animation.

## Conductor Tracks & Demo Recording

- **Track Parsing & Formatting**: Commits that modify files under `conductor/tracks/` are automatically scanned. The parser extracts the subfolder name as the commit's `track` and generates a user-friendly version (`track_display`) by stripping trailing date suffixes (e.g., `_20260616`) and converting underscores to title-case spaces.
- **Track Status Display**:
  - The Mission Briefing overlay card displays the **LATEST TRACK** worked on by each committer.
  - In the canvas simulation, when a ship is active on a track, its overhead label box dynamically expands its height to render a neon-cyan subtitle showing the track name: `Track: Disable Mock Fallback Dev`.
- **HUD & Briefing Track Counters**: Both the top HUD bar and the initial briefing card display the count of unique Conductor **TRACKS** present in the timeline, incrementing dynamically as the simulation progresses.
- **Demo Recording Automation**: Programmatic browser video captures of the arcade simulation are automated using `shot-scraper video storyboard.yml --mp4`.