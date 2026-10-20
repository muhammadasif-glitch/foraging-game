# Changes

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
