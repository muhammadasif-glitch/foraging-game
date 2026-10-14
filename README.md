# Food rooms: a foraging game

The foraging task of [active-inference-foraging](https://github.com/muhammadasif-glitch/active-inference-foraging)
(version 3), played by people in the browser. A player walks through a maze
of rooms one step at a time, finds food rooms that are hidden and can be in
other places in every game, and keeps up an energy bar. Every key press is
recorded, with its time, and sent to [DataPipe](https://pipe.jspsych.org),
which saves the files into the study's Google Drive folder.

The maze, the food and the energy follow exactly the rules of the model's
runs: `check/rules_check.py` compares the two on 2,000 random runs, number
for number, and `check/data_check.py` replays recorded games through the
model's own code. A game file also holds the game in the form of a model run,
so the measures of the agents' runs (`forage.lab.measures`) score people's
games the same way.

Plain HTML and JavaScript: no server, no build step, nothing to install.

## Putting it online (GitHub Pages)

1. Create a repository on GitHub, for example `foraging-game`, and push these
   files to it.
2. In the repository: **Settings > Pages > Build and deployment**, source
   **Deploy from a branch**, branch **main**, folder **/ (root)**, Save.
3. After a minute the game is at `https://<user>.github.io/foraging-game/`.

`.nojekyll` makes GitHub Pages serve the files as they are. The game also
opens straight from the folder (double-click `index.html`) for trying it;
use `?send=0` then (see below).

## A session

1. Consent (the text of `settings.js`). **Y** agrees; **N** declines, and
   nothing is recorded or sent.
2. Player code, typed (letters, digits, `-` and `_`, up to 40).
3. Instructions, a few pages (arrow keys back and forward).
4. The games of `settings.js`, in order. By default: a practice game of 30
   steps, the shared game (the same layout and seed for every player), 3
   games with new random layouts, and a repeat of the first of those (not
   announced). After each game except the practice, the memory test: the map
   of the rooms the player was in, without the food marks; the player marks
   the food rooms with **Enter** (again to unmark), finishes with **Space**,
   then says how full each marked room is now, **0** (empty) to **9** (full).
   A break page between games.
5. "How did you play?", typed, then the thank-you page, which says when the
   data is saved.

In a game the arrow keys move and **Space** stays. Arrows on the player's
room show the open sides; a key towards a wall moves nothing, costs nothing,
shakes the maze and is recorded. Rooms appear on the map once visited (or all
from the start: `show.map: "full"`), and the rooms next to the player's room
through an open side are drawn as dashed outlines. A food room is hidden until
the player walks in; from then on it is marked on the map, and while the
player is in it the panel shows how full it is. The panel shows the energy,
the steps left, and a short "+0.9" on a step that pays food.

So that keys meant for one screen do not answer the next: a key pressed
before a game's screen has changed is ignored ("busy"); the first step of a
game, the "game over" message, the memory test (Space ends it after 1.5 s),
the level questions, the break pages, the end question and the instruction
pages each ignore keys for a moment after they appear ("too soon"); and Space
ends the "game over" message, the memory test or a break only after a pause in
Space presses, so that Space held or tapped on and on goes through nothing.
Keys held down do not repeat; keys with Ctrl, Alt or Meta are ignored; Tab
does not leave the page. All of these are still recorded.

If the page loses the keyboard (the player clicked elsewhere), a note at the
top asks to click on the page. Leaving or reloading the page in the middle of
a session asks first; a reload starts a new session (a new session id, from
the consent), and what was played before arrives as `.partial` files.

The game needs a recent browser (it checks for what it uses and says so) and
a keyboard (on a phone or tablet it says to use a computer). If the game
itself fails, it stops, keeps what was played and asks the player to tell the
researchers; errors of other scripts in the page (a browser extension) are
left alone.

## Settings

Everything a study changes is in `settings.js`, with a comment on every key:

- `datapipe.experiment_id`: the DataPipe experiment; `if_no_condition`: what
  to do when DataPipe cannot hand out a condition (`random` or `stop`).
- `game`: what every game has: the maze (`grid_4x4`, `grid_6x6`,
  `grid_two_4x4`), steps, start room, the food rooms (place `random` or a room
  such as `s33`, worth, level at the start), the food rule and its speed
  (`half_empty_in`, or `eat_per_step` and `refill_speed`), random refill, the
  stomach (start, size, costs, what happens at 0), what is shown, and whether
  there is a memory test.
- `conditions`: the versions of the game. A condition changes any key of
  `game`; under `food_rooms` it changes rooms or adds new ones.
- `session`: the games of a session, in order (`practice`, `shared`, `new`,
  `repeat` with `of`, the number of the game repeated); a game here can change
  any key of `game` too. A practice or shared game takes its `layout` (start
  room and food rooms), or without one a layout fixed by its seed, the same
  for every player; new and repeat games take none. A shared game needs a
  `seed`.
- `texts`: everything the player reads, the consent text first. **Replace the
  consent text with your institute's before collecting data.** The texts are
  not changed by the settings, apart from what is in `{...}` (the stomach
  numbers, the steps, what happens at 0, and whether there is a practice
  game): check them when you change what is shown, the memory test, or the
  food rule.

The keys have the names of the experiment files of the `forage` command, so a
game and a model run are set up alike. The game refuses what the model
refuses: start rooms outside rows and columns 0 to 3 (where the model's agents
can start), eating speeds above 1, `empty_below` not below `full_above`. The
whole file, every condition with every game and the link's settings, is
checked when the page opens; a mistake is shown on the page instead of the
game.

### Links

| Link | What it does |
|---|---|
| `?condition=linear_fast` | this condition |
| `?condition=auto` (or none) | DataPipe hands the conditions out in turn |
| `?player=P017` | fills in the player code |
| `?test=1` | marks every file as a test: names start with `TEST_` (also when the player code is `test`) |
| `?send=0` | sends and keeps nothing; the files are printed to the browser console |
| `?set.maze=grid_6x6` | changes a setting of every game, for trying things out (`?set.food.rule=exponential`, `?set.steps=10`, ...); recorded in the files |

## DataPipe

The experiment in DataPipe needs **data collection on**. Recommended on its page:

- **Conditions:** on, with the number of conditions in `settings.js` (2 by
  default), for `?condition=auto`. Condition 0 is the first in the file,
  1 the second, and so on. If DataPipe cannot hand one out, the game picks one
  at random and records why (`if_no_condition: "stop"` refuses to start
  instead). The condition is asked for after the consent and the player code.
- **Validation:** on, JSON only, required fields `format`, `player`, `session_id`.
- **Base64 data:** off. **Session limit:** see below.

Each session sends 1 file per game and 1 at the end (7 with the default
session), plus `.partial` files for a session cut short, so DataPipe's count
of completed sessions counts files, not players. Set a session limit, if any,
accordingly.

Every file is kept in the browser until DataPipe has taken it; one that cannot
be sent is tried again, then every 30 s while the page is open, and again the
next time the page is opened in that browser. The game in progress (with its
memory test) and the session so far are kept after every change. If the page
is closed, they go into the browser's queue and the browser is asked to send
them on the way out. The browser allows 64 KB for all of them together, so
the game goes first, in a short form (`.partial-short.json`) when the whole
file would not fit, then the session if there is room; the full files
(`.partial.json`) follow the next time the page is opened in that browser.
Every open page marks itself as alive once a minute. A page that crashed
leaves its files to be sent by the next page of the study once it has been
gone for 10 minutes, so a second open tab is not mistaken for one, and a page
never sends its own files early.
The files of 2 studies on the same site are kept apart, and open tabs of one
study share the queue without sending each other's files twice.

Before a study, play once with `?test=1` and check that 7 files arrive in the
Drive folder; delete the `TEST_` files afterwards.

## The data

Files are JSON:

| File | |
|---|---|
| `<player>_<session>_<n>-<kind>.json` | game n with its memory test |
| `<player>_<session>_<n>-<kind>.partial.json` | game n, cut short (the page closed during the game or its memory test) |
| `<player>_<session>_<n>-<kind>.partial-short.json` | the same, in short form (only the moves and their times), sent on closing when the whole file is too long |
| `<player>_<session>_end.json` | the rest of the session |
| `<player>_<session>_end.partial.json` | the same, for a session cut short |

Every file starts with the same header:

| Key | |
|---|---|
| `format`, `format_version`, `file` | `foraging-game`, 1, and `game`, `partial game`, `end` or `partial session` |
| `game_version` | the version of this code |
| `player`, `session_id`, `test` | the code typed, a random id of the session, test or not |
| `session_started` | date and time the page opened (UTC) |
| `condition` | `{name, how, datapipe, error}`: the condition, and how it was chosen (`link`, `datapipe`, `random`, `no conditions`) |
| `link` | the options of the link |
| `browser` | `user_agent`, `languages`, `screen`, `window`, `pixel_ratio`, `time_zone`, `utc_offset_minutes`, `cores`, `touch_points`, `clock_step_ms` (the smallest step of the browser's clock), `frame_ms` and `refresh_hz` (screen frames) |

All times (`t`, `..._at`) are milliseconds on the browser's event clock,
counted from when the game's script started (a moment after the page opened).
A screen's `shown_at` is the start of the frame after the one that drew it,
which is when it was on the screen; decision times are measured from there.
They are as precise as the browser's clock (`clock_step_ms`), and the screen
adds up to about one frame (`frame_ms`).

**A game file** adds `game`, and the `keys` and `attention` events of that
game and its memory test. `game`:

| Key | |
|---|---|
| `number`, `kind`, `label`, `practice`, `repeat_of` | which game of the session |
| `layout` | maze, start room and the room of each food room |
| `seed`, `draws` | the seed of the game's own random numbers for refills (not numpy's) and every draw, 1 per step, used or not: the draws reproduce the game |
| `layout_seed` | the seed the layout was picked with |
| `settings`, `speeds` | all the settings of this game, and the eating and refill speeds used |
| `started`, `started_at`, `ended` | `ended`: `{how, step, at}`; how is `finished`, `starved` or `page closed` (then `at` is when the page closed); for a game cut short during its memory test, `finished` with `page_closed_at` |
| `steps` | 1 row per step, step 0 being the start (below) |
| `memory_test` | the memory test (below), or null without one |
| `result` | the game as a model run: `settings` (world, run, satiety) and `rows` as in `forage.v3.record`, for `forage.lab.measures.of_run`; laid over the defaults of `forage.v3.settings` they are valid settings of a model run |

A row of `steps` (step 0 is the start: no key, move or times, nothing paid,
`legal` the moves open from the start room):

| Key | |
|---|---|
| `step` | 0 for the start, then 1, 2, ... |
| `shown_at` | when the screen of this choice was on the screen |
| `key_at`, `decision_ms` | when the key was pressed, and the time since `shown_at` |
| `released_at`, `hold_ms` | when the key was let go, and for how long it was held |
| `key`, `move` | `ArrowUp`, ... or `Space`; `UP`, `DOWN`, `LEFT`, `RIGHT` or `STAY` |
| `room_from`, `room_to`, `room` | rooms as `s<row><column>`, `s00` top left |
| `legal` | the moves open from the room the choice was made in |
| `walls_before`, `other_keys_before` | keys towards a wall, and other keys, pressed while choosing |
| `paid`, `cost`, `food_lost`, `energy` | food eaten, the step's energy cost, food lost to a full stomach, energy after the step |
| `levels` | the true level (0 to 1) of every food room after the step, also the ones the player cannot see |
| `change` | what happened to each food room: `eaten`, `refilled` or `skipped` (random refill) |
| `draw` | the step's random draw |
| `in_food_room`, `seen`, `shown` | the food room the player is in, its level, and what the panel showed (`74%`, or `part full`) |
| `energy_shown`, `steps_left` | what the panel showed |
| `found`, `revealed`, `events` | a food room found on this step, a room visited for the first time, and events: `found`, `empty`, `full again`, `refill skipped`, `food lost` |

`memory_test`: `shown_at`, `actions` (cursor moves, marks, unmarks, done, with
times), `marked` (the rooms marked, in order), `levels` (for each marked room:
`answer` 0 to 9, `shown_at`, `key_at`, `ms`), `done_at`, and `truth` (where
the food rooms were, their levels at the end of the game, and which the player
had found).

`keys`: every key press and release: `t`, `type` (`down` or `up`), `key` (as
the browser names it; Space is `" "`), `code`, `repeat`, `with` (Shift, Ctrl,
Alt, Meta, when held), `phase` (`consent`, `code`, `instructions`, `game 3`,
`memory 3`, `break 3`, `end question`) and `outcome`: in a game `move`,
`stay`, `wall`, `not allowed` (a move on a first step that must be a stay),
`ignored: busy`, `ignored: too soon`, `ignored: repeat`, `ignored: key`,
`ignored: with Ctrl, Alt or Meta`, `ignored: game over`, `go on`; in the
memory test `cursor`, `cursor blocked`, `mark`, `unmark`, `done`, `answer`;
on the pages `accepted`, `refused`, `next`, `back`, `start`; and anywhere
`ignored: too soon`, `ignored: repeat` or `ignored: key`, or null for a key
nothing listens to (a key release, a key typed into a text field). Keys typed
into a text field are recorded as `char`; the text itself is recorded once.
`attention`: the tab hidden or shown and the window losing or getting back
focus, with times and phases.

**The end file** adds `session`: the session's `seed` and the whole
`settings.js` (`settings_file`); `consent` (shown and answered); `code` (the
player code, shown and entered); `instructions` (each visit to a page, shown
and left); `games` (file names and how they ended); `breaks` (each break,
shown, ended, its length); `end_question` (text, shown, first key, entered,
keys, deletions); `ended`, `ended_at`; `earlier_files_left` (files from
earlier visits still unsent when the session ended); `sending` (what DataPipe
answered for each file sent so far); and the keys and attention events
outside the games.

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
- `half_empty_in` h gives the speed `0.5 / h` (linear) or `1 - 0.5^(1/h)`
  (exponential); the second is worked out to the last digit, as Python does it
  for every h up to 270.
- The mazes in `js/mazes.js` are written from the model by
  `check/export_mazes.py`, so both have the same rooms and colours.

## Checks

With a checkout of active-inference-foraging (and its upstream code) and
`PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning`:

```
python check/rules_check.py          # the rules against the model, 2,000 random runs
python check/export_mazes.py --check # js/mazes.js is the model's mazes
node check/play_check.js out/        # whole sessions in Chromium (needs Playwright)
python check/data_check.py out/      # the recorded games replayed through the model
```

`play_check.js` plays sessions in a real browser and checks every file the
game sends, with DataPipe stood in for:

- a full session, and one with every game played to its last step;
- random refill on 6 x 6, and running out of energy;
- no condition from DataPipe, and DataPipe down with the files sent on the next visit;
- a tab closed in the middle of a game, during a memory test, and during the end question;
- Space tapped fast after a game, and the browser's storage full;
- the page opened from a file, and a player who declines.

## Known limits

- Keyboard only; made for a computer.
- A game cut short reaches DataPipe in full only if the browser sends it on
  closing (shorter games) or the page is opened again in the same browser;
  otherwise in short form, or not at all if the browser sends nothing.
- Tested in Chromium; Firefox and Safari not yet.
- A tab the browser stops for over 10 minutes while another tab of the study
  is open (some power-saving modes do) is taken for a crashed one: its files
  so far are sent as partial files. If it then goes on and finishes, the full
  files follow and the partial ones can be ignored; if it is cut short again,
  the later `.partial.json` files do not replace the ones already sent.
- The task is not the agent's in every respect. The agent of the model knows
  where the food rooms are and what they are worth, and the food rule; the
  player knows none of these and sees a map of the rooms visited. Both are
  told the open sides of their room. Measures of searching (`never_found`,
  `<room>_first`, `rooms_visited`) are not comparable as they are.
