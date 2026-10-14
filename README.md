# Food Rooms: a foraging game

The foraging task of [active-inference-foraging](https://github.com/muhammadasif-glitch/active-inference-foraging)
(version 3), played by people in the browser, in 2 versions: the maze seen
from above (2D) or from inside (3D). A player walks through a maze of rooms
one step at a time, finds food rooms that can be in other places in every
game, and keeps up an energy bar. Every key press is recorded, with its time,
and sent to [DataPipe](https://pipe.jspsych.org), which saves the files into
the study's Google Drive folder.

What the game does is what the model does, and the checks show it:

- the maze, the food and the energy follow the rules of the model's runs
  number for number (`check/rules_check.py`, 2,000 random runs), and recorded
  games replay in the model's own code (`check/data_check.py`);
- the player is shown of the maze and the food exactly what the model's agent
  knows (`check/map_check.py` runs the agent);
- the maze is laid out as in the model's films, tile for tile, with the
  films' colours (`check/layout_check.py`).

A game file also holds the game in the form of a model run, so the measures
of the agents' runs (`forage.lab.measures`) score people's games the same way.

Plain HTML and JavaScript: no server, no library, no build step, nothing to
install; the 3D view, the food, the paintings and the music are made by the
game itself.

## Putting it online (GitHub Pages)

1. Create a repository on GitHub, for example `foraging-game`, and push these
   files to it.
2. In the repository: **Settings > Pages > Build and deployment**, source
   **Deploy from a branch**, branch **main**, folder **/ (root)**, Save.
3. After a minute the game is at `https://<user>.github.io/foraging-game/`.

`.nojekyll` makes GitHub Pages serve the files as they are. The game also
opens straight from the folder (double-click `index.html`) for trying it;
use `?send=0` then (see below).

## Playing

**The first page** offers the view (2D from above, 3D from inside) and the
mazes of `settings.js` with their size (4 x 4, 6 x 6, 2 blocks of 4 x 4 joined
by a bridge, and the environments made with the model, see below). The up and
down arrows go between the 2 rows, the left and right arrows choose, the keys
1 to 9 choose a maze, Enter plays. There is no consent page and no
instructions: one line says what to do, and the keys are shown during the
game. The player code is made by the game and kept in the browser.

**A game**: 120 steps (or until the energy runs out). The bar at the top shows
the energy, how full the food room the player is in is, its food and worth,
the food eaten and the steps left.

- 2D: the arrow keys move to the next room in their direction, Space stays.
- 3D: the up arrow walks through the door the player faces (the door within
  45 degrees of where the player looks); the left and right arrows turn, a
  tap by about 10 degrees, held they keep turning (they can be held while
  walking, to steer); the down arrow turns around; Space stays. A turn is not
  a step: it costs nothing and the world does not change; it is recorded.
- The player walks only while the key is held down: a tap goes a little
  way, and letting go stops the player where they are, in a corridor too.
  Held on, the player walks on through the next door, room after room. The
  walk speeds up and slows down, and in 3D the head bobs a little.
- On the way to the next room the player can go back (in 3D turn around and
  walk, in 2D the opposite arrow) until that room is entered.
- A move towards a wall is not a step: nothing changes, the view shakes, the
  key is recorded.

**What is a step.** A move is a step when the player enters the next room
(crosses its door): the world changes then, as in the model, and the rooms
next to it come into light. A walk back into the room it began in is no
step; it is recorded in `walks_back`. A stay is a step when Space is
pressed; it takes a moment (0.24 s in 2D, 0.42 s in 3D), and held, Space
stays again after each one. Turns and keys towards a wall are not steps.

**What the player sees** is what the model's agent knows. The agent has the
room it is in on its map and, after its first step, every room next to the
room it is in (through a door); it knows whether such a room holds food and
what it is worth, and sees how full a food room is only while it is in it.
So the game shows in light the rooms the player has been in and, from the
first step on, the rooms next to them; everything else is dark. A food room
among them shows a sign with its food and worth (a cheese and "food 8"),
never its level; the room the player is in shows the food itself. At step 0
only the start room is shown: the agent's first move is made before it has
mapped any other room. Rooms the player learns of come into light while the
player walks into the room next to them, instead of all at once on arrival.

**The food.** The room worth 8 holds a cheese wheel, the room worth 1 a loaf
of bread, each in 10 pieces: at a level of 0.73 there are 7 whole wedges (or
slices) and an eighth that is 0.3 of one. Staying eats from the room, as in
the model: a piece goes down, crumbs fall and it crunches. A room that has
grown back since the player left it is seen growing back on entering. In 3D
the food stands in the middle of its room and the player stops in front of
it; in 2D it is seen from above. Which room shows which food is set in
`settings.js` (`food_rooms.<name>.food`: `cheese` or `bread`; without it the
room worth the most shows cheese and the others bread).

**The walls** of the 3D view are plaster in the colour of the room, with a
framed painting on each side of the room. Each room colour has its own
painting, so a painting tells the player no more than the colour of the
wall; corridors are grey. The paintings are public-domain works of the Art
Institute of Chicago, fetched once by `check/get_paintings.py` (see Paintings
below); until then the game paints its own landscapes.

**Sound.** Quiet music, footsteps, eating, a bump at a wall, a chime when
food has grown back and a short tune at the end, all made by the browser (no
sound files). Sound starts with the first key the player presses (browsers
allow it only after one); M or the button in the bottom corner turns it on
and off at any time. `game.sound` in `settings.js` says whether a session
starts with sound; every switch is recorded.

**The end of a game** shows the food eaten and the way the player went: the
rooms the player knew at the end (only those, so the map shows no more of
the maze than the player saw), the moves as a line from blue at the first
step to red at the last with an arrow on each, a ring on each room the player
stayed in (thicker for more stays), S at the start and E at the end, and on
each food room its food and what was eaten there. Enter goes back to the
first page for another game. Each game is saved as soon as it ends.

## Settings

Everything a study changes is in `settings.js`, with a comment on every key:

- `datapipe.experiment_id`: the DataPipe experiment; `if_no_condition`: what
  to do when DataPipe cannot hand out a condition (`random` or `stop`).
- `menu`: the views and the mazes the first page offers, in order.
- `game`: what every game has: steps, start room (`random`, any room such as
  `s52`, or `environment`), `start_area` (null: random starts anywhere; 4: only
  in rows and columns 0 to 3), the food rooms (place `random`, a room such as
  `s33` or `environment`, worth, level at the start, and the food it shows),
  the food rule and its speed (`half_empty_in`, or `eat_per_step` and
  `refill_speed`), random refill, the stomach (start, size, costs, what
  happens at 0), what the bar shows, and whether a session starts with sound.
- `conditions`: the versions of the game. A condition changes any key of
  `game`; under `food_rooms` it changes rooms or adds new ones.
- `texts`: everything the player reads.

The keys have the names of the experiment files of the `forage` command, so a
game and a model run are set up alike. The game refuses what the model
refuses: a start or food room that is not a room of the maze, eating or
refill speeds above 1, `half_empty_in` that gives one, and food bin edges not
in `0 < empty_below < full_above < 1`. The whole file, every condition in
every maze with the link's settings, is checked when the page opens; a
mistake is shown on the page instead of the game. So a room such as `s52`, or
`environment`, can only be used when every maze of the menu has it.

### Mazes and environments

The mazes are the model's (`js/mazes.js`, written from it by
`check/export_mazes.py`): the 3 that come with it and every environment file
in its `settings/environments/`, made with its `tools/make_environment.py`
(a shape typed in, or a grid with holes, a maze with loops, or blocks joined
by bridges, of any size). A new environment comes into the game in 2 steps:
run `check/export_mazes.py` again with the model's checkout on the path, and
add its name to `menu.mazes`. The game then lays it out, colours it and
checks it as the model does. With `start_rooms: "environment"`,
`food_rooms.<name>.room: "environment"` or `steps: "environment"`, a game
takes the start rooms, food rooms or steps of the maze's environment file.
Rooms from row or column 10 on are named with a `_`: `s10_3`.

### Paintings

`check/get_paintings.py` fetches about 48 public-domain landscape paintings
from the Art Institute of Chicago, whose images of public-domain works are
released under CC0, into `img/paintings/` (400 pixels wide, with
`CREDITS.md` and `credits.json`), and packs them into `js/paintings.js`, which
the page reads. It leaves out still lifes, food, portraits and violent
scenes, and waits 1 second between requests, as the museum asks; run it once
from the game's folder, with internet:

```
python check/get_paintings.py            # fetch and pack (about a minute)
python check/get_paintings.py --pack     # pack again what is in img/paintings/
```

Images can also be added to or taken out of `img/paintings/` by hand; run it
with `--pack` after. The paintings are packed into a script, not loaded as
image files, so that they also show when the game is opened from a file.

### Links

| Link | What it does |
|---|---|
| `?condition=linear_fast` | this condition |
| `?condition=auto` (or none) | DataPipe hands the conditions out in turn |
| `?view=3d`, `?maze=grid_6x6` | chosen on the first page at first (the player can still change it) |
| `?test=1` | marks every file as a test: names start with `TEST_` |
| `?send=0` | sends and keeps nothing; the files are printed to the browser console |
| `?set.steps=30` | changes a setting of every game, for trying things out (`?set.food.rule=exponential`, ...); recorded in the files |

## DataPipe

The experiment in DataPipe needs **data collection on**. On its page:

- **Validation:** DataPipe turns it on for every new experiment with the
  required field `trial_type`. Every file of the game has `trial_type`,
  `player` and `session_id` at its top, so set the required fields to those 3
  (or leave `trial_type` alone). DataPipe refuses a file that lacks one with
  `INVALID_DATA`, and refused data cannot be recovered.
- **Conditions:** on, with the number of conditions in `settings.js` (2 by
  default), for `?condition=auto`. Condition 0 is the first in the file,
  1 the second, and so on. If DataPipe cannot hand one out, the game picks one
  at random and records why (`if_no_condition: "stop"` refuses to start
  instead).
- **Metadata (Psych-DS):** off. It is made for jsPsych data, a list of
  trials; with it on, DataPipe answers every file of this game with
  `METADATA_ERROR` ("Data must be an array of trials"). It still keeps such a
  file and stores it later without the metadata, so the game counts it as
  kept, but the dashboard lists it as rejected.
- **Session limit:** off. DataPipe counts every file it accepts, and a player
  sends 1 file per game.
- **Base64 data:** off.

Every file is kept in the browser until DataPipe has taken it; one that cannot
be sent (no answer, or a server error) is tried again, then every 30 s while
the page is open, and again the next time the page is opened in that browser.
A file DataPipe refuses (any other `400`, such as `INVALID_DATA`,
`SESSION_LIMIT_REACHED` or data collection turned off) is not sent again
during that visit, is tried again on the next visit, and is given up after 3
refusals. Files an older version of the game left in a browser without
`trial_type` are given it before they are sent. The game in progress is kept
after every step. If the page is closed during a game, it goes into the
browser's queue and the browser is asked to send it on the way out, in a short
form (`.partial-short.json`) when the whole file is longer than the browser
allows (64 KB); the whole file (`.partial.json`) follows the next time the page
is opened in that browser. Every open page marks itself as alive once a
minute; a page that crashed leaves its game to be sent by the next page of
the study once it has been gone for 10 minutes. The files of 2 studies on the
same site are kept apart, and open tabs share the queue without sending each
other's files twice.

Before a study, play a short game with `?test=1&set.steps=10` and check that
its file arrives in the Drive folder; delete the `TEST_` files afterwards.

## The data

Files are JSON, 1 per game:

| File | |
|---|---|
| `<player>_<session>_<n>.json` | game n |
| `<player>_<session>_<n>.partial.json` | game n, cut short (the page closed during the game) |
| `<player>_<session>_<n>.partial-short.json` | the same, in short form (only the moves and their times), sent on closing when the whole file is too long |

Every file has at its top:

| Key | |
|---|---|
| `trial_type` | `foraging-game` (for DataPipe's validation) |
| `format`, `format_version`, `file` | `foraging-game`, 3, and `game` or `partial game` |
| `game_version` | the version of this code |
| `player`, `player_code` | the player code (8 hex digits), and whether it was `new` or `kept in this browser` |
| `session_id`, `session_started`, `test` | a random id of the page's visit, when it opened (UTC), test or not |
| `condition` | `{name, how, datapipe, error}`: the condition, and how it was chosen (`link`, `datapipe`, `random`, `no conditions`) |
| `link` | the options of the link |
| `browser` | `user_agent`, `languages`, `screen`, `window`, `pixel_ratio`, `time_zone`, `utc_offset_minutes`, `cores`, `touch_points`, `clock_step_ms` (the smallest step of the browser's clock), `frame_ms` and `refresh_hz` (screen frames) |
| `menu` | the first page before this game: `shown_at`, `chosen_at`, `view`, `maze`, and `actions` (every change of choice, with times) |
| `game` | the game (below) |
| `keys`, `attention` | every key press and release, and the tab or window losing and getting back focus, from the end of the game before (the end page, the first page, the game) |
| `sound_log` | every switch of the sound in the same time: `{t, phase, on, by}`, by `M` or `button` |

All times (`t`, `..._at`) are milliseconds on the browser's event clock,
counted from when the game's script started (a moment after the page opened).
A screen's `shown_at` is the start of the frame after the one that drew it,
which is when it was on the screen; decision times are measured from there.
They are as precise as the browser's clock (`clock_step_ms`), and the screen
adds up to about one frame (`frame_ms`).

`game`:

| Key | |
|---|---|
| `number`, `view`, `maze` | which game of the visit, `2d` or `3d`, the maze |
| `layout` | maze, start room and the room of each food room |
| `seed`, `draws` | the seed of the game's own random numbers for refills (not numpy's) and every draw, 1 per step, used or not: the draws reproduce the game |
| `layout_seed` | the seed the layout was picked with |
| `settings`, `speeds` | all the settings of this game, and the eating and refill speeds used |
| `controls` | how the player moves: walking speed and its speeding up (tiles a second; a room is 4 tiles, a corridor 3), how long a stay takes, and in 3D how a tap, a held key and turning around turn |
| `food_kinds` | the food each food room shows: `cheese` or `bread` |
| `sound` | `on_at_start`, and `toggles`: every switch during the game, `{t, step, on, by}` |
| `path`, `known_rooms` | the room of every step from step 0, and the rooms the player knew at the end (what the end page draws) |
| `walks_back` | every walk towards a room that went back to the room it began in: `{started_at, back_at, step (steps taken before), room, toward, move, furthest (the share of the way to the next room's door reached), held}` |
| `started`, `started_at`, `ended` | `ended`: `{how, step, at}`; how is `finished`, `starved` or `page closed` (then `at` is when the page closed) |
| `steps` | 1 row per step, step 0 being the start (below) |
| `turns` | 3D: every turn, `{t, step (steps taken before it), key, from, to, from_angle, to_angle, ms, held_ms}`: `from` and `to` are the doors faced (`RIGHT`, `DOWN`, `LEFT`, `UP`), the angles in degrees (0 east, 90 south), `held_ms` how long the key was held. A turn still going on when a step is taken ends there (`split`), and the rest is a turn of its own (`continued`, with no key press of its own) |
| `result` | the game as a model run: `settings` (world, run, satiety) and `rows` as in `forage.v3.record`, for `forage.lab.measures.of_run`; laid over the defaults of `forage.v3.settings` they are valid settings of a model run |

A row of `steps` (step 0 is the start: no key, move or times, nothing paid,
`legal` the moves open from the start room):

| Key | |
|---|---|
| `step` | 0 for the start, then 1, 2, ... |
| `shown_at` | when the screen of this choice was on the screen |
| `shown_at` | when the player could act: the room before entered (or the stay before over), or the game shown for step 1 |
| `key_at`, `decision_ms` | when the walk to this room began (the key pressed, or, for a key held on, the moment it walked on), and the time since `shown_at`; for a stay, when Space was pressed |
| `entered_at` | when the step was taken: the room entered (for a stay, Space pressed); the world changes then |
| `held`, `press_at`, `stops` | whether the walk began with a key held on from before, when that key was pressed, and how often the player stood still on the way |
| `arrived_at`, `stopped_at` | when the player reached the middle of the room (in 3D a food room: the place before the food), or the stay was over; or, when the player stopped in the room before its middle, when that was |
| `released_at`, `hold_ms`, `released_by` | when the key was let go, and for how long it was held after the step; `released_by: blur` when the window lost the keyboard while it was down |
| `key`, `move` | `ArrowUp`, ... or `Space`; `UP`, `DOWN`, `LEFT`, `RIGHT` or `STAY` |
| `facing_before`, `facing`, `angle_before`, `turns_before` | the door the player faced before and after the step (`RIGHT`, `DOWN`, `LEFT`, `UP`; in 2D the last move), in 3D the angle in degrees, and the turns made since the step before (3D) |
| `room_from`, `room_to`, `room` | rooms as `s<row><column>`, `s00` top left |
| `legal` | the moves open from the room the choice was made in |
| `walls_before`, `other_keys_before` | keys towards a wall, and other keys, pressed while choosing |
| `paid`, `cost`, `food_lost`, `energy`, `eaten` | food eaten on the step, its energy cost, food lost to a full stomach, energy after the step, food eaten so far |
| `levels` | the true level (0 to 1) of every food room after the step, also the ones the player cannot see |
| `change` | what happened to each food room: `eaten`, `refilled` or `skipped` (random refill) |
| `draw` | the step's random draw |
| `in_food_room`, `seen`, `shown` | the food room the player is in, its level, and what the bar showed (`74%`, or `part full`) |
| `energy_shown`, `steps_left` | what the bar showed |
| `known_new`, `known_food_new` | the rooms the player is shown from this step on (at step 0 the start room; then the room entered and the rooms next to it), and the food rooms among them |
| `found`, `events` | a food room entered for the first time on this step, and events: `known` (a food room shown for the first time), `found`, `empty`, `full again`, `refill skipped`, `food lost` |

`keys`: every key press and release: `t`, `type` (`down` or `up`), `key` (as
the browser names it; Space is `" "`), `code`, `repeat`, `repeats` (how many
times the browser repeated the press while the key was held; the repeats are
not recorded 1 by 1), `with` (Shift, Ctrl, Alt, Meta, when held), `phase`
(`menu`, `game 3`, `end 3`) and `outcome`: in a game `walk`, `walk back` (2D, the
opposite arrow on the way), `stay`, `turn`, `wall`, `not allowed` (a move on
a first step that must be a stay), `ignored: between rooms` (Space, or in 2D a
sideways arrow, on the way), `ignored: busy` (during a stay), `ignored:
turning` (while turning around), `ignored: too soon`, `ignored: key`,
`ignored: with Ctrl, Alt or Meta`; on the first page `view`, `maze`, `row`, `play`, `ignored: not
ready`; at the end of a game `menu`; anywhere `sound on` or `sound off` (M),
`ignored: too soon` or `ignored: key`, or null for a key nothing listens to (a
key release, a key between 2 screens). A walk taken with a key held on has no
key press of its own: it is the press in `press_at`, still down. `attention`: the tab hidden or shown and the window
losing or getting back focus, with times and phases.

### Scoring with the model's measures

`forage.lab.measures.of_run(game["result"], measures)` gives the measures of
the agents' runs. Set `measures["energy"]` to the game's stomach
(`result["settings"]["satiety"]`: start, stomach, move_cost, stay_cost), as
`check/data_check.py` does; with `at_zero: "continue"` the energy score still
ends at the first 0, while the game went on. To replay a game through the
model's world, give `FoodWorld` the recorded `draws` (see `data_check.py`).

## The rules

The same as the model (active-inference-foraging, `src/forage/v3/world.py`,
and the stomach of `src/forage/v3/run.py`), in `js/rules.js`:

- Once per step, after the move, every food room is eaten if the player was in
  it on the step before, and refilled otherwise (with random refill, only
  when the step's draw is below `refill_chance`). Linear: eaten `level - eat`,
  refilled `level + refill`; exponential: eaten `level - eat x level`, refilled
  `level + refill x (1 - level)`. Levels stay between 0 and 1, rounded to 9
  decimals as Python rounds them.
- So, as in the model, entering a food room refills it once more and pays
  its level; each step of staying eats from it and pays the level after; and
  the step of leaving eats from it once more, without paying.
- A step in a food room pays its worth times its level after that step.
- Energy: minus `move_cost` for a move or `stay_cost` for a stay, plus the
  food paid, at most `size` (the rest is lost), at least 0.
- The moves open from a room are those of the model's maze, in the model's
  order; `js/mazes.js` is written from the model by `check/export_mazes.py`.

## Checks

With a checkout of active-inference-foraging (and its upstream code) and
`PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning`:

```
python check/rules_check.py          # the rules against the model, 2,000 random runs
python check/export_mazes.py --check # js/mazes.js is the model's mazes
python check/layout_check.py         # the maze drawn as in the model's films (needs node)
python check/map_check.py            # what the player is shown against the model's agent (a few minutes)
node check/play_check.js out/        # games in Chromium, 2D and 3D (needs Playwright)
python check/data_check.py out/      # the recorded games replayed through the model
python check/draw_route.py GAME.json # the way a player went, as on the end page (needs matplotlib)
```

`map_check.py` runs the model's agent in each maze and checks before every
move that the rooms in its map are exactly the rooms the game shows, and that
among them the food rooms, and only they, carry a preference.
`play_check.js` plays in a real browser and checks every file the game sends,
with DataPipe stood in for (with its validation of the required fields):

- 3 games in a row (2D and 3D, the 3 mazes that come with the model) with the
  condition from DataPipe, and the player code kept for the next visit;
- a 3D game played to its last step, with turns;
- running out of energy, with keys pressed during stays;
- keys held down in 2D and 3D: walking on from room to room, steering while
  walking, stays repeated, the sound switched with M and with the button, and
  the route map drawn at the end;
- the environments of the model in both views, starting anywhere, with
  cheese and bread, and the settings that take rooms and steps from an
  environment file;
- no condition from DataPipe, and DataPipe down with the file sent on the next visit;
- a tab closed in the middle of a game, then the partial game sent;
- the page opened from a file.

`data_check.py` replays every game file through the model's world, checks
its settings are those of a valid model run, scores it with the model's
measures, checks the rooms shown at each step against the rule above, and
checks the fields DataPipe's validation needs.

## Known limits

- Keyboard only; made for a computer.
- The paintings are the game's own landscapes until `check/get_paintings.py`
  has been run once with internet.
- Tested in Chromium; Firefox and Safari not yet.
- A game cut short reaches DataPipe in full only if the browser sends it on
  closing (shorter games) or the page is opened again in the same browser;
  otherwise in short form, or not at all if the browser sends nothing.
- The player is shown of the maze and the food what the agent knows, but the
  task is not the agent's in every respect: the agent also knows the food
  rule and its speeds, while the player is told in 1 line that food runs down
  and grows back, and learns how fast by playing. In 3D the player sees into
  the rooms next door through their doors, as the agent knows them; rooms
  further away are dark.
- A visit in which the player plays no game sends nothing; the first page's
  keys of a visit go into the file of its first game.
- A tab the browser stops for over 10 minutes while another tab of the study
  is open (some power-saving modes do) is taken for a crashed one: its game so
  far is sent as a partial file. If it then goes on and finishes, the whole
  file follows and the partial one can be ignored.
