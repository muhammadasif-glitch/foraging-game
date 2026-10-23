# Changes

## 2.6.0

- Characters: the player can be a man, a woman, a dog, the mouse, a robot or
  a knight (`js/characters.js`). With `game.player: "choose"` (now the
  default) a page before the first page shows them, the one chosen walking
  in 3D, and the player chooses; C on the first page comes back to it.
  `game.player` set to one of them makes every player that one.
- Each is a 3D model under an open licence (CC BY 4.0; `characters/CREDITS.md`)
  drawn with three.js r147 (`js/three`, MIT) into the 3D view's own
  picture, with its camera and depth, in the light of its room; in 2D the
  same model seen from above. A model, its clips and its sounds are 1 file,
  `characters/<name>.js`, loaded when the character is chosen (also with
  the game opened as a file), made by `check/make_characters.py` from what
  `check/media/get_characters.py` downloads.
- Each stands, walks and runs with clips that loop: the man and the woman
  as people of the CMU motion capture database did, the robot running as
  they do, the knight with its own walk and run, the dog with a trot and a
  gallop made for its skeleton (`check/dog_gait.py`). The clips are blended
  by speed and turned as fast as the ground goes by, so the feet keep to the
  floor, and each step sounds as a foot lands; walking backwards plays them
  backwards, turning on the spot takes small steps.
- Each eats: standing in a food room, a person brings the food to the mouth
  with the right hand, bites and chews; the dog puts its head down to the
  floor and bites.
- The team's data page (`analysis.html`, opened with the team password):
  game files, a folder of them or a zip, become tables for the research
  (`js/tables.js`): games, steps, food levels, visits to food rooms,
  navigation (every move from room to room), the track, keys, turns, looks,
  likes, clicks, music and the page's events, 1 row for each observation,
  every column described. Each game shown with its route and its energy;
  downloads as an Excel workbook or as CSV files with SPSS labels. Nothing
  is sent; the files are read in the browser.
- Each runs at a person's speed (5 to 6 metres a second; the mouse's speed
  in 3D is 14): 35% to 42% of the mouse's speed, in both views.
  `game.same_speed: true` gives all the mouse's speed.
- Recorded sounds (CC0, Freesound): shoes, bare feet, chain mail, a robot's
  steps; voices for a food room found, a wall and a full bar; bites. Each
  plays a little differently every time; the dog's claws, its sniffing and
  the robot's whirr are still made by the browser.
- Each has its own eyes (the height of the 3D view), camera behind it and
  prints in 2D. The body that bumps into walls, turning, the rules and the
  steps are the same for all.
- Characters need WebGL; where the 3D view is drawn by ray casting the
  player is the mouse, no page is shown, and the file says why (also when a
  character's file cannot be loaded).
- The 3D view's canvas keeps the screen's pixels at every level: below
  level 0 the picture is drawn into a buffer and spread over the canvas. A
  canvas made smaller or bigger is empty until drawn again, which could show
  as a flash when the level changed. `?level=` keeps a level (for the
  checks).
- Keeping the game in the browser after every step (for a page closed
  during a game) no longer copies the whole game first: it takes about
  half as long, so it holds up the player's keys less in a long game.
- File format 9: `character` (who, how chosen, why not, every characters
  page with its times and actions); `menu.character`; `controls` has
  `speed_factor`, `eye` and `step_tiles` (a character's at its top speed);
  `render.fixed_level`.
- Nothing changes in the rules, the steps, the food or the energy: the
  games replay in the model as before.

## 2.5.1

- The graphics card draws the 3D view (WebGL, `js/gl3d.js`) at the
  screen's own pixels (up to 2 for each pixel of the page), with smooth
  edges, walls and floors 4 times as fine as before and sharp far down the
  corridors; the same cameras, colours, light, fog and pictures as before.
  Only when the screen frames come slowly (a weak graphics card on a large
  screen) does it go down to fewer pixels, and up again when they come
  fast. A picture coming in is handed to the graphics card at most 1 a
  frame, so the game does not stop for it.
- Browsers without WebGL, or whose WebGL is drawn by the processor (slower
  there than the ray casting), and the link `?gl=0`, keep the ray casting
  of 2.5.0. `?gl=1` draws with WebGL also by the processor (for the checks).
- Larger paintings: up to 80% of the height of the wall (0.8 tiles instead
  of 0.5), between the moulding and the skirting board, each in its own
  shape (never stretched or cut), its frame drawn at the picture's own
  pixels; very wide ones up to 1.5 tiles. The Like plaque stays beside the
  frame, half way up the wall. The game's own landscapes
  (`game.paintings: false`) keep their size.
- Standing before a painting (3D), the view looks up at it until its middle
  is in the middle of the screen, and through the eyes it steps back (at
  most 1 tile, never into a wall) when the painting is too near to be seen
  whole; walking or turning brings the view back. Only the view moves: the
  player stays where it is, and the steps, the rules and the looking are as
  before (the painting looked at is still the one in the middle of the
  view, its distance from the player).
- The food, the signs, the gramophone and its notes are drawn 2 to 3 times
  as fine.
- The ray casting (no WebGL) draws a big near painting from a copy halved
  to about the size it needs, in fewer strips when it is seen at a slant:
  about 1 ms instead of up to 140 ms on a slow computer.
- File format 8: the track has `tilt` and `back` (how far the view looks up
  and steps back); `render` has `renderer` (`webgl2`, `webgl` or
  `canvas`), `gpu`, `webgl` (why the ray casting drew) and `frame_ms`.
- Nothing changes in the rules, the steps, the food or the energy: the
  games replay in the model as before.

## 2.5.0

- Paintings: 641 famous paintings in the public domain, from Wikimedia
  Commons, chosen from ArtEmis (painters who died in 1955 or before, the 8
  emotions of ArtEmis mixed, no food, nudity or violence in the titles).
  Every game hangs them anew: each wall of each room another painting, so no
  painting hangs twice in a game. Each keeps its own shape, in a gilded
  frame. Near paintings are drawn from their own images at the screen's
  pixels (512 pixels, and 1600 in the room the player is in), far ones from 1
  small picture of all of them. `game.paintings: false` keeps the landscapes
  of before (1 for each room colour).
- A Like plaque beside every frame (`game.likes`): L likes the painting in
  the middle of the view, a click likes the painting of the plaque, again
  takes the like back.
- Looking is recorded: the painting in the middle of the view (up to 6
  tiles away), how far and how big, in the track every 100 ms and summed up
  for every painting seen (`looks`).
- The music room (`game.music_room`, both views): 1 room, never the start
  or a food room, has a gramophone. Near it, P or a click plays a famous
  piece (8 real recordings from Wikimedia Commons, `js/music.js`) and stops
  it; the music fades on the way out of the room; what plays is shown with
  its players and licence.
- Liking and the music cost nothing, are not steps and do not hold up the
  stays: standing before a painting is standing still, a stay every second.
- Sharper 3D: the ray casting draws at 1 of 6 levels of the screen's pixels
  (100% to 32%), as sharp as the computer draws quickly, going down and up
  with the time a drawing takes; a pixel takes about two thirds of the time
  it took before (whole pixels written at once). Paintings, food, signs, the gramophone and the mouse are drawn
  over it at the screen's pixels.
- File format 7: `gallery_seed`, `gallery`, `looks`, `likes`, `clicks`,
  `music`, `render`; the track has `look`, `look_d`, `look_share` and
  `music`; keys have the outcomes of L and P.
- `check/make_paintings.py` puts the paintings and the music into the game;
  `check/media/` has the scripts that chose and downloaded them
  (`check/get_paintings.py`, for the paintings of the Art Institute of
  Chicago, is gone).
- Nothing changes in the rules, the steps, the food or the energy: the
  games replay in the model as before.

## 2.4.0

- The player is a little mouse (`game.player: "mouse"`; `"arrow"` keeps
  the disc with an arrow). In 2D it is seen from above, its feet moving with
  every step, with paw prints that fade. Its steps come from the distance
  walked, about 10 a second in 2D and 7.5 in 3D, so the picture and the
  sound of the steps keep time; before, 2D had 1 step sound per room and 3D
  about 2.5 a second.
- 3D has 2 cameras, each a view on the first page: `3d`, through the
  mouse's eyes (low, a quarter of the way up the walls, with the tips of its
  whiskers at the bottom corners and a small, smooth rise and sway once every
  2 steps), and `3d_behind`, from behind the mouse, which is seen running in
  front of the camera. That camera comes closer where a wall is behind the
  mouse, never into a wall; with little room behind the mouse it goes down
  to just over its head, and the mouse's nearest parts fade out.
- The mouse's sounds: the patter of its feet (2 feet a moment apart, with
  their claws; harder in corridors; a short echo in 3D), nibbling, sniffing
  in a new room, and squeaks (`game.voice`) on finding a food room, running
  into a wall and a full bar, each a little different every time.
- When a bite is more than fits into the energy bar, the part that does
  not fit is shown next to it ("+6.0 2.8 over full"); while the player is
  full in a food room, a sign says to walk out to eat again
  (`texts.full_sign`). The data and the food eaten are as before.
- File format 6: `game.camera` (`eyes`, `behind`, null in 2D); the first
  page's `view` can be `3d_behind` (then `game.view` is `3d`).
- Nothing changes in the rules, the steps, the food or the energy: the
  games replay in the model as before.

## 2.3.1

- A fix: a browser filling in a saved password or name (in the maze
  editor's fields) sends key events without a key, and the game stopped with
  "Cannot read properties of undefined (reading 'length')". Such events are
  now ignored. The browser check sends them.

## 2.3.0

- The maze editor: with `?edit=1` the first page has a "+ New maze" card.
  Draw a maze on a grid (rooms, start, cheese and bread rooms), with checks
  while drawing; try it in 3D or 2D at once (nothing saved or sent); save it
  into the game with the team password. The page then waits until GitHub
  Pages serves the new maze and opens again with it.
- The team's mazes are kept in `js/my_mazes.js` and shown on the first page
  for every player, after the mazes of `settings.js`. Their start, cheese and
  bread rooms and their moves are used; a maze the game cannot use is left
  out and listed in the editor.
- Saving goes through GitHub with a key that may change only this
  repository, kept in `js/team_key.js` locked with the team password
  (PBKDF2 and AES-GCM in the browser). A name already saved is refused, and
  a save that meets someone else's is done again on top of it.
- `js/my_mazes.js` and `js/team_key.js` are loaded fresh, not from the
  browser's cache, so a new maze shows at once after the page opens again.
- A fix: walking through the corner of a room whose 2 doors meet at that
  corner (s00 of grid_4x4, for example) could stop the game with an error,
  because the player arrived in the room after it without having entered
  it. Such a room now counts as a move, taken at the same moment as the
  move after it (`corner: true`). The browser check crosses such a corner.
- Stays while standing still (and while Space is held) are timed from the
  moment the stay before was taken, so they are always at least
  `idle_stay_ms` apart in the file.
- File format 5: `maze_def` holds the maze of the game (rooms and, for a
  maze of the team, its drawing and who saved it). `check/data_check.py`
  replays games in mazes of the team through the model's world too (the
  maze is added in memory; the model is not changed).

## 2.2.0

- Only moves use up the steps (`count_steps: "moves"`): a game is 120 moves
  or ends when the energy runs out. A stay still costs energy, eats in a food
  room and lets food grow back, but leaves the moves as they were. The bar
  shows the moves left. `count_steps: "all"` counts every step as the model.
- The place and the view of the player are recorded every 100 ms
  (`track_ms`, in `track`).
- File format 4: `ended` has `moves`, `idle_stays` and `space_stays`; every
  step has `moves`; `steps_left` counts moves; new `track`. In the game as a
  model run (`result`), `run.steps` is at least the steps the game took.
- The route map at the end says first and last instead of step numbers.
- An angle just under 0 degrees was recorded as 360; it is 0 now.

## 2.1.0

- Walking: the player walks freely, as in other games, while a key is
  held: in 3D the up arrow walks where the player looks and the down arrow
  backwards, in 2D the arrows walk their way. The walk speeds up and slows
  down, slides along walls and into doors, and is guided to the middle of
  doors and corridors; the food stands in the way. In 3D the head bobs a
  little.
- A move is a step when the player walks onto the floor of the next room
  (the world changes then); out into a door or corridor and back is no step
  and is recorded in `walks_back`. Standing still with no key held is a stay
  every second (`idle_stay_ms`), so energy runs down while the player waits;
  Space is a stay at once and every second while held. Stays never hold the
  player up; holding keys and time cost nothing.
- Eating until full: in a food room the player eats on every step until the
  energy bar is full, then stops for the rest of that visit; the food is left
  and the room does not run down (`stomach.when_full: "stop"`; `"keep"` eats
  on as the model). Steps record `by` (walk, Space, idle), `kept` and `full`.
- 3D turning speeds up while the key is held and slows down when it is let
  go: a tap turns a few degrees, a hold turns steadily, also while walking.
  Turns are recorded with their angles.
- The 3D view is drawn faster (the fog is worked out once per row and per
  column).
- The rooms the player learns of come into light while the player walks in,
  instead of all at once.
- Food: a cheese wheel in the room worth 8 and a loaf of bread in the room
  worth 1, each in 10 pieces with a thinner partial piece; bites, crumbs and
  a crunch when a stay eats from it, and the food seen growing back on
  entering. Signs show the food and its worth, never the level. Which food a
  room shows is a setting (`food_rooms.<name>.food`).
- Walls: plaster in the room colour, with a framed painting on each side of
  a room, the same painting for the same colour. `check/get_paintings.py`
  fetches public-domain paintings (CC0, Art Institute of Chicago) and packs
  them into `js/paintings.js`; until then the game paints its own landscapes.
- Sound: music and sounds made in the browser, an on/off button and the M
  key, the start set in `settings.js` (`game.sound`); every switch is
  recorded.
- The end of a game shows the way the player went, over the rooms the player
  knew; the file holds `path` and `known_rooms`, and
  `check/draw_route.py` draws the same map from a game file.
- Mazes: every environment file of the model (made with its
  `tools/make_environment.py`) is offered on the first page once
  `check/export_mazes.py` has been run again; starts in any room
  (`start_area: null`); `environment` takes start rooms, food rooms and steps
  from the maze's file; rooms from row or column 10 on are named with a `_`;
  room colours as the model's films give them for up to 144 colours.
- Key repeats while a key is held are counted on the press (`repeats`)
  instead of being recorded 1 by 1.
- File format 3: new fields `controls`, `food_kinds`, `sound`, `path`,
  `known_rooms`, `walks_back`, `sound_log`; in a step `entered_at`,
  `left_at`, `held`, `press_at`, `stops`, `walked_tiles`, `angle_before`,
  `angle`; in a turn `from_angle`, `to_angle`, `ms`, `held_ms`.
