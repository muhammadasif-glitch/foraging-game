# Food Rooms: a foraging game

The foraging task of [active-inference-foraging](https://github.com/muhammadasif-glitch/active-inference-foraging)
(version 3), played by people in the browser, in 2D (the maze seen from
above) or in 3D (from inside, through the player's eyes or from behind it).
The player chooses who to be (a man, a woman, a dog, a mouse, a robot or a
knight), then walks through a maze of rooms
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
install; the 3D view, the food and the quiet music are made by the game
itself. The paintings on the walls are 641 famous public-domain paintings and
the gramophone of the music room plays 8 famous recordings, all from
Wikimedia Commons (`img/paintings/CREDITS.md`, `audio/music/CREDITS.md`).

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

**Who are you?** (`game.player: "choose"`). Before the first page a page
shows the characters of `menu.characters`, the one chosen walking in 3D; the
arrows, the keys 1 to 6 or a click choose, Enter (or a second click, or Next)
goes on. C on the first page comes back to it before another game. The page
is only shown where the 3D view is drawn by the graphics card (WebGL, see
Sharpness): elsewhere the player is the mouse, and the file says why. Set
`game.player` to one of them (`man`, `woman`, `dog`, `mouse`, `robot`,
`knight`) and every player is that one, with no page.

**The first page** offers the view (2D from above, 3D from inside, 3D from
behind) and the
mazes of `settings.js` with their size (4 x 4, 6 x 6, 2 blocks of 4 x 4 joined
by a bridge, and the environments made with the model, see below). The up and
down arrows go between the 2 rows, the left and right arrows choose, the keys
1 to 9 choose a maze, Enter plays. There is no consent page and no
instructions: one line says what to do, and the keys are shown during the
game. The player code is made by the game and kept in the browser.

**A game**: 120 moves, or until the energy runs out. The bar at the top shows
the energy, how full the food room the player is in is, its food and worth,
the food eaten and the moves left.

The player walks freely, as in other games, while a key is held:

- 2D: the arrow keys walk in their direction (2 at once walk on the slant).
- 3D: the up arrow walks where the player looks, the down arrow walks
  backwards, the left and right arrows turn: the turn speeds up while the
  key is held and slows down when it is let go, so a tap turns a few
  degrees and a hold turns steadily (also while walking, to steer). A turn
  is not a step: it costs nothing and the world does not change; it is
  recorded.
- The walk speeds up and slows down; the player slides along walls, and
  walking into a wall next to a door slides into the door; doors and
  corridors draw the player to their middle. The food stands in the way.
  In 3D the view rises and sways a little with the mouse's strides.

**What is a step.** A move is a step when the player walks onto the floor of
the next room: the world changes then, as in the model, and the rooms next
to it come into light. Walking out into a door or a corridor and back into
the same room is no step; it is recorded in `walks_back`. A stay is a step,
in 2 ways: standing still (no key held at all) is a stay every second
(`idle_stay_ms`), so energy runs down while the player waits; and Space is a
stay at once, then every second while it is held. A stay never holds the
player up. Holding keys, turning and walking into walls cost nothing and are
not steps; time itself costs nothing.

**Moves and stays.** Only a move uses up 1 of the game's 120 steps
(`count_steps: "moves"`): a stay costs energy (`stay_cost`, a move
`move_cost`), eats in a food room and lets the world go on (food grows back),
but leaves the moves as they were. So a game ends after 120 moves or when
the energy runs out. `count_steps: "all"` counts every move and stay, as the
model does.

A room is entered when the player is 0.3 tiles in. A room whose 2 doors sit at
the same corner (in grid_4x4, s00 has its doors to s01 and s10 at its bottom
right corner) can be crossed at that corner without being 0.3 tiles in; the
player then arrives in the room after it, and the room crossed is a move too,
taken at the same moment (`corner: true` on its row), as the model's agent
passes through it.

**Eating until full.** In a food room the player eats on every step, as in
the model (entering pays the level, each stay eats a bite and pays the level
after), until the energy bar is full. Then eating stops for the rest of that
visit (`stomach.when_full: "stop"`): the food is left, the room does not run
down, nothing is paid, and the bar shows "full"; walking out does not take a
last bite either. Coming back starts eating again. While the player is full
in a food room, a sign at the top says so ("full: eat again after you walk
out", `texts.full_sign`). When a bite is more than fits into the bar, the
part that does not fit is shown next to it ("+6.0 2.8 over full"), so the bar
going up less than the food is no surprise; the food eaten counts all of it,
as in the model. `"keep"` eats on as the model does (food beyond a full bar is
lost).

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
painting in a gilded frame on each side of the room; corridors are grey.
Every game hangs the paintings anew: each wall of each room gets a different
painting, drawn at random from all 641 (`game.paintings`; see Paintings
below), so the 4 paintings of a room are different and no painting hangs
twice (the biggest maze the editor makes, 140 rooms, has 560 walls). A
painting keeps its own shape (never stretched or cut): in its frame it is
up to 80% of the height of the wall (0.8 tiles, between the moulding and the
skirting board; a wall is 1 tile high), very wide ones up to 1.5 tiles
across. With `game.paintings: false` the game paints its own landscapes
instead, the same one for the same room colour, as before 2.5.0 (and as
small as then).

**Liking a painting** (3D, `game.likes`). Beside every frame hangs a small
plaque with a thumb up and "Like". L likes the painting in the middle of the
view (up to 6 tiles away), a click on a plaque likes its painting; the plaque
turns green and says "Liked", and L or a click again takes the like back.
Liking costs nothing, is not a step and does not hold up the stays: a player
who stands before a painting stands still, so a stay comes every second as
ever, also while L is pressed. Every like is recorded (`likes`).

**Looking at paintings** (3D) is recorded, as people look where they face:
the painting in the middle of the view, up to 6 tiles away, is the one looked
at (its frame across the middle column of the view), with how far the player
is from it and how much of the width of the screen the painting covers. The
track (every 100 ms) has it, and the file sums it up for every painting seen:
how long it was looked at, in how many looks, how long it was on the screen
at all, when it was first seen and first looked at, how near the player
came, and whether it was liked at the end (`looks`).

**Looking up** (3D). A player who stands before a painting (up to 3.5 tiles
away) sees the view look up at it until the middle of the painting is in the
middle of the screen, as a person raises the head. Through the eyes, when the
painting is too near to be seen whole, the view also steps back (at most 1
tile, never into a wall) until the painting and its plaque fit on the screen.
Walking or turning brings the view back. Only the view moves: the player
stays where it is, so the steps and the distances recorded are as without it.
The track has both (`tilt`, `back`).

**The music room** (both views, `game.music_room`). 1 room of every game,
never the start room or a food room, has a gramophone in its middle (the
player walks round it, as round the food). Near it (up to 3.2 tiles from its
middle, so in the room or at its door) P or a click on the gramophone plays a
record, and P or a click again stops it; a hint at the top says so. Each
record is another of the 8 famous pieces of `js/music.js`, real recordings
(Debussy's Clair de lune, the first movement of Beethoven's Moonlight Sonata,
Satie's first Gymnopedie, the Prelude of Bach's first cello suite, the
Romanze of Mozart's Eine kleine Nachtmusik, the first movement of Vivaldi's
Spring, Chopin's Nocturne op. 9 no. 2 and Pachelbel's Canon), in an order
shuffled for the game; what plays, who plays it and its licence is shown at
the top while it plays, and notes rise from the horn. The music is loudest in
the room and fades out on the way to the rooms around it (gone 9 tiles
away); it stops at its end or at the end of the game. While it plays, the
game's own quiet music rests. P when the sound is off turns the sound on (M
mutes the gramophone too). Like the likes, the music costs nothing and is
not a step. Every record played is recorded (`music`).

**Sharpness** (3D). The graphics card draws the 3D view (WebGL,
`js/gl3d.js`) at the screen's own pixels (at most 2 for each pixel of the
page), with smooth edges, and with the floor and the walls sharp to the far
end of a corridor; the paintings come from their own images (512 pixels, or
1600 pixels in the room the player is in). It shows the same maze as before:
the same cameras, colours, light, fog, paintings, food, signs and gramophone,
and the mouse drawn over it. Only when the screen frames come more than 34
ms apart while the player moves (a weak graphics card on a large screen)
does the picture go down a level (84%, 71%, 59%, 45% and 32% of the screen's
pixels across), and up again after 12 s of frames under 20 ms apart (a level
it had to leave is not tried again for 60 s). Below level 0 the picture is
drawn into a buffer of its own and spread over the canvas, which keeps the
screen's pixels: a canvas made smaller or bigger is empty until it is drawn
again, which showed as a flash.

A browser without WebGL, or whose WebGL is drawn by the processor (a
computer without a graphics card the browser may use: slower there than the
ray casting), and the link `?gl=0`, get the ray casting of before
(`js/view3d.js`): it draws a picture of its own at 1 of the same 6
levels, the sharpest of at most 520,000 pixels at first, a level down when a
drawing takes longer than 13 ms, a level up when the level above would take
less than 10.5 ms (a level it had to leave is not tried again for 30 s). The
paintings near enough to be at least 90 pixels high on the screen, the food,
the signs, the gramophone and the mouse are drawn over it at the screen's
own pixels, so they stay sharp at every level.

The file records which of the 2 drew the game (`webgl2`, `webgl` or
`canvas`) and the graphics card, the screen, the level at the start, every
change and the drawing times (`render`).

**The mouse** (`game.player: "mouse"`). In 2D it is seen from above: its
feet move in diagonal pairs with every step, its tail swings, its whiskers
sweep back as it runs and tremble while it stands, it nibbles at the food,
and it leaves paw prints that fade after 1.6 s. Its steps come from the
distance it walks (a step every 0.7 tiles in 2D, 0.6 in 3D: about 10 and 7.5
a second at full speed), so the feet, the prints, the view and the patter of
the steps keep time. 3D has 2 cameras, each a view of the first page:

- `3d`, through the mouse's eyes: the eyes are a quarter of the way up the
  walls (a person's would be half way), the view rises and sways a little
  once every 2 steps, and the tips of its whiskers show, out of focus, at the
  bottom corners.
- `3d_behind`, behind the mouse: the camera is 1.6 tiles behind it and a
  little above, looking down a little, and the whole mouse is seen running
  in front of it (it leans into turns and nibbles at the food). Where a wall
  is behind the mouse, the camera comes closer; never into a wall, never with
  a wall between it and the mouse, and not right next to a door frame. When
  there is little room (the mouse with its back to a wall), the camera goes
  down to just over the mouse's head and the parts of the mouse nearest to
  it fade out, so the mouse never fills the view: its head and ears stay in
  sight at the bottom.

The other characters have the same 2 cameras: through their eyes (at their
own height, the view rising and swaying with their steps, more for the heavy
ones), and behind them at their own distance and height (see The
characters), coming down to just over the head near a wall, where the
character fades a little.

Both cameras show the same maze, food and signs, with the same keys,
speeds and rules; the file records which one was used (`camera`). With
`game.player: "arrow"` the player is the disc with an arrow of the versions
before 2.4.0, seen through a person's eyes in 3D (no `3d_behind`).

**The characters** (js/characters.js). Each is a 3D model drawn by
three.js (`js/three`) into the picture of the 3D view, with its camera and
depth, so walls in front of it hide it, in the light of its room. A model,
its clips and its sounds are in 1 file, `characters/<name>.js`, loaded when
the character is chosen (it also loads with the game opened as a file);
`check/make_characters.py` makes these files from what
`check/media/get_characters.py` downloads (credits: `characters/CREDITS.md`).

Each moves with 3 clips that loop: standing, walking and running. The man
and the woman stand, walk and run as people of the CMU motion capture
database did, and the robot walks and runs as they do; the knight has its
own walk and run; the dog's trot and gallop are made for its skeleton
(`check/dog_gait.py`). The clips are blended by the speed and turned as fast
as the ground goes by, so the feet keep to the floor: the steps grow longer
and quicker together, and their sound comes as each foot lands. Walking
backwards plays them backwards; turning on the spot takes small steps.

A fourth clip comes in while the character eats standing still in a food
room (from the first bite until a moment after the last, or until it
walks): the man, the woman, the knight and the robot bring the food to the
mouth with the right hand, bite with the head bent to meet it and chew
with the food held before the chest; the dog puts its head down to the
floor and bites, its tail wagging.

Each runs at a person's speed (a dog's for the dog): a wall is 3.2 m high, so
the mouse's speed in 3D (4.5 tiles a second) would be 14 metres a second,
faster than anyone runs. `game.same_speed: true` gives every character the
mouse's speed instead (its legs then go faster than a person's).

| | eyes (3D, part of the height of a wall) | top speed | speed (part of the mouse's) | the camera behind it (tiles back, its height) | steps | voice |
|---|---|---|---|---|---|---|
| man | 0.52 | 5.5 m/s | 38% | 1.6, 0.78 | shoes | "hm" and a satisfied sigh |
| woman | 0.48 | 5.3 m/s | 37% | 1.55, 0.74 | bare feet | 2 kinds of "hmm" |
| dog | 0.19 | 6 m/s | 42% | 1.0, 0.42 | paws with the click of claws (made by the browser) | barks, a whine, panting |
| mouse | 0.25 | 14.4 m/s | 100% | 1.6, 0.55 | its patter (below) | its squeaks |
| robot | 0.42 | 5 m/s | 35% | 1.5, 0.70 | heavy metal steps | beeps, a glitch |
| knight | 0.53 | 5 m/s | 35% | 1.65, 0.80 | boots in chain mail | the man's voice, deeper |

The steps, voices and bites are recordings (CC0, Freesound), each played a
little differently every time; a step on the stone of a corridor rings
brighter than on the floor of a room. The speed is also a part of the speed
of the game in 2D. In 2D each is seen from above (the same model) with
prints of its own (shoes, bare feet, boots, paws, the treads of the robot).
The dog sniffs in a room it has not been in. Everything else is the same for
all: the body that bumps into walls, turning, the rules and the steps, so
games stay comparable; the file records the character, how it came to be,
and its speed, eyes and step (`character`, `controls`).

**Sound.** Quiet music, footsteps, eating, a bump at a wall, a chime when
food has grown back and a short tune at the end, all made by the browser (no
sound files). The mouse has its own: the patter of its feet (2 feet landing
a moment apart with the tick of their claws, harder on the stone of a
corridor than on the floor of a room, with a short echo of the room or
corridor in 3D), nibbling, and sniffs in a room it has not been in. With
`game.voice` it squeaks when it finds a food room, when it runs into a wall
and when the energy bar is full, at most once every 1.2 s and each time a
little differently. Sound starts with the first key the player presses (browsers
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
- `menu`: the views (`2d`, `3d`, `3d_behind`) and the mazes the first page
  offers, in order, and the characters the characters page offers
  (`characters`, with `game.player: "choose"`). A study that wants every
  player in the same view lists only that one (and sets `game.player` to 1
  character for every player as that one).
- `game`: what every game has: steps, start room (`random`, any room such as
  `s52`, or `environment`), `start_area` (null: random starts anywhere; 4: only
  in rows and columns 0 to 3), the food rooms (place `random`, a room such as
  `s33` or `environment`, worth, level at the start, and the food it shows),
  the food rule and its speed (`half_empty_in`, or `eat_per_step` and
  `refill_speed`), random refill, the stomach (start, size, costs, what
  happens at 0, `when_full`), what the bar shows, `idle_stay_ms` (a stay every
  this many ms with no key held), `count_steps` (`moves`: only moves use up
  the steps; `all`: every step, as in the model), `track_ms` (the player's
  place and view recorded every this many ms; 0: not at all), whether a
  session starts with sound, the player (`player`: `choose`, a character, or
  `arrow`), whether every character walks at the same speed (`same_speed`),
  whether the mouse or the character has a voice (`voice`), and the paintings, their Like plaques
  and the music room (`paintings`, `likes`, `music_room`).
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

### Paintings and music

The paintings come from [ArtEmis](https://www.artemisdataset.org)
(Achlioptas et al., 2021), the 80,031 paintings of WikiArt that people named
the emotions of: famous painters who died in 1955 or before (so their works
are in the public domain), chosen so that the 8 emotions of ArtEmis are mixed
(each painting's most named emotion; anger and disgust are rarer), with no
food, nudity or violence in their titles, then found on Wikimedia Commons,
which marks each as public domain or CC0. Their ArtEmis names (`artemis`) are
in `js/paintings.js`; the emotions stay with the research team, outside this
repository. The steps, in `check/media/` (only Python, run where there is
internet):

```
python make_shortlist.py <artemis_dataset_release_v0.csv> <Contrastive.csv> artemis_shortlist.json
python get_paintings.py      # finds each painting on Wikimedia Commons, downloads it (30 to 45 minutes)
python get_music.py          # the recordings (about 5 minutes)
```

`get_paintings.py` keeps a painting only when Wikimedia Commons has the same
painting: the painter and the title match, the years agree within 5 (else it
is another version), and no other ArtEmis painting has the same picture; it
goes on where it stopped and never downloads a painting twice. Then the
copies for the game (at most 1600 and 512 pixels on the longest side) go
into the game with

```
python check/make_paintings.py <folder with paintings.json, large/ and small/> --music <folder with music.json and music/>
```

which writes `img/paintings/`, `js/paintings.js` (the list, with a small
picture of every painting in 1 image, for paintings far away and for the
game opened from a file), `audio/music/`, `js/music.js` and both
`CREDITS.md`. The game loads the image of a painting only when the player
comes near it: the 512 pixel copies of the room the player is in and the
rooms next to it, and the 1600 pixel copies of the room the player is in.

### Characters

The characters' models come from Sketchfab (CC0 or CC BY only), their
sounds from Freesound (CC0), the motion capture from the CMU database. On a
computer with internet (Python only, in `check/media/`):

```
python get_characters.py search     # candidates, and a page to pick from (a Freesound key for the sounds)
python get_characters.py download   # the picked models (a Sketchfab token), sounds, three.js, motion capture
python get_characters.py more       # more models, kinds of steps and the motion capture again
python get_characters.py mocap      # only the motion capture (no token, no key)
```

The keys and the token are asked when needed and never kept. Then the
characters for the game (numpy, Pillow and ffmpeg; the pictures need
Playwright):

```
python check/make_characters.py <the characters folder> [name ...]
node check/character_pictures.js [name ...]
```

`make_characters.py` keeps what the game draws of each model (its textures
at most 1024 pixels), moves the man, the woman and the robot with the
motion capture (each bone turned as the person's turned from rest, the
hips moved as theirs, scaled to the model's legs; loops cut from a foot
landing to the same foot landing), makes the dog's trot, gallop and eating
(`check/dog_gait.py`: when each paw lands, its way through the air, the
legs reaching it by turning at their joints, the back, head and tail),
makes eating for the others from their standing clip (the right arm
reaching the mouth by turning at the shoulder and the elbow about the
elbow's own axis, the fingers closed round the food, the back and the head
bending to the bite), cuts and levels the sounds, and writes
`characters/<name>.js` with `characters/CREDITS.md`. `character_pictures.js` draws the pictures of the
characters page (`img/characters/`).

### Links

| Link | What it does |
|---|---|
| `?condition=linear_fast` | this condition |
| `?condition=auto` (or none) | DataPipe hands the conditions out in turn |
| `?view=3d_behind`, `?maze=grid_6x6` | chosen on the first page at first (the player can still change it); the views are `2d`, `3d`, `3d_behind` |
| `?test=1` | marks every file as a test: names start with `TEST_` |
| `?send=0` | sends and keeps nothing; the files are printed to the browser console |
| `?set.steps=30` | changes a setting of every game, for trying things out (`?set.food.rule=exponential`, ...); recorded in the files |
| `?edit=1` | adds the maze editor to the first page (see below); its files are tests (`TEST_`) |
| `?gl=0` | the 3D view drawn by the ray casting instead of the graphics card (as a browser without WebGL has it) |
| `?gl=1` | the 3D view drawn with WebGL also where the processor draws it (for the checks, whose browser has no graphics card) |
| `?level=3` | the 3D view drawn with WebGL keeps level 3 (0 to 5) all the time (for the checks; recorded as `render.fixed_level`) |

## The maze editor

Open the game with `?edit=1` at the end of its address. The first page then
has a **+ New maze** card (or the key N), which opens the editor:

1. **Draw**: rows and columns (2 to 12), then click squares. With the Rooms
   tool (key R) a click takes a room out or puts it back, and dragging does
   the same over several squares. With Start, Cheese and Bread (keys S, C, B)
   a click puts the start, the cheese room (worth 8) or the bread room
   (worth 1) there; a click on it again takes it away. One left out is
   placed at random each game, as in the other mazes. Rooms side by side are
   joined by a door, and every room has its own colour (so its own
   painting), at most 140 rooms.
2. **Checks**, while drawing: every room reachable from every other, a free
   name (small letters, digits and `_`), the moves (1 to 1000), and the
   settings of the game fitting the maze. Cut-off rooms are outlined in red.
3. **Try in 3D / Try in 2D** plays the maze at once; nothing is saved or
   sent. Esc, or Enter at the end, goes back to the editor with the drawing
   kept (also when leaving the editor, until **Start again**).
4. **Save to game**: your name and the team password. The maze is written
   into `js/my_mazes.js` in the repository, the page waits until GitHub Pages
   serves it (about 30 s to 2 minutes) and opens again with the maze chosen.
   It is on the first page for every player, after the mazes of `settings.js`.

A saved maze is never changed: a name that is there already is refused, so
an edited maze is saved under a new name. To take a maze out, delete its
entry from `js/my_mazes.js` on GitHub; the game files of games played in it
keep the whole maze. In a maze of the team, its start, cheese and bread rooms
are used where `settings.js` says `random`, and its moves unless the link
sets `set.steps`. A maze that `js/my_mazes.js` holds but the game cannot use
(cut off, or not fitting the settings) is left out; the editor's first page
lists why.

### Setting up saving (once)

The repository is public, so a password checked by the page itself would
stop no one. GitHub is the lock: only a key with write access can change the
repository. The editor keeps such a key in `js/team_key.js`, locked with the
team password (PBKDF2 with 600,000 rounds, then AES-GCM, in the browser), and
unlocks it only for a save.

1. On GitHub: **Settings > Developer settings > Personal access tokens >
   Fine-grained tokens > Generate new token**. Repository access: **Only
   select repositories**, this one. Permissions: **Contents: Read and
   write**. An expiry date, for example 1 year.
2. Choose a team password of at least 16 characters, for example 4 or 5
   random words. The locked key is public, so a short password could be
   found by trying many.
3. Open the game with `?edit=1`, draw a maze, and press **Set up saving and
   save**: paste the key, check the repository (`owner/name`) and the branch
   (`main`), and type the password twice. The key is checked, locked, saved
   as `js/team_key.js`, and the maze is saved with it.
4. Give the team the password, not the key.

If the password gets out, or the key runs out: make a new key, **delete the
old key on GitHub** (old versions of `js/team_key.js` stay in the
repository's history, so a new password alone is not enough), and use **Set
up saving again** in the editor with the new key and a new password.

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
| `format`, `format_version`, `file` | `foraging-game`, 9, and `game` or `partial game` |
| `game_version` | the version of this code |
| `player`, `player_code` | the player code (8 hex digits), and whether it was `new` or `kept in this browser` |
| `session_id`, `session_started`, `test` | a random id of the page's visit, when it opened (UTC), test or not |
| `condition` | `{name, how, datapipe, error}`: the condition, and how it was chosen (`link`, `datapipe`, `random`, `no conditions`) |
| `link` | the options of the link |
| `browser` | `user_agent`, `languages`, `screen`, `window`, `pixel_ratio`, `time_zone`, `utc_offset_minutes`, `cores`, `touch_points`, `clock_step_ms` (the smallest step of the browser's clock), `frame_ms` and `refresh_hz` (screen frames) |
| `character` | who the player was in this game: `{name, how, fallback, choices}`: `name` (`man`, `woman`, `dog`, `mouse`, `robot`, `knight` or `arrow`), `how` (`chosen` on the characters page, `settings`, or `no choice`: no page, as without WebGL), `fallback` (why the mouse instead of the character asked for, such as `no WebGL` or `could not load the man: ...`; null), `choices` (every characters page since the game before: `{shown_at, chosen_at, character, actions}`, an action `{t, how (key, click, click again, button, Enter), character}`) |
| `menu` | the first page before this game: `shown_at`, `chosen_at`, `view` (`2d`, `3d` or `3d_behind`), `maze`, `character`, and `actions` (every change of choice, with times) |
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
| `number`, `view`, `camera`, `maze` | which game of the visit, `2d` or `3d`, the 3D camera (`eyes`, `behind`; null in 2D), the maze |
| `layout` | maze, start room and the room of each food room |
| `seed`, `draws` | the seed of the game's own random numbers for refills (not numpy's) and every draw, 1 per step, used or not: the draws reproduce the game |
| `layout_seed` | the seed the layout was picked with |
| `settings`, `speeds` | all the settings of this game, and the eating and refill speeds used |
| `controls` | how the player moves: walking speeds and their speeding up and slowing down (tiles a second; a room is 4 tiles, a corridor 3; for the character), the size of the body, how long a stay takes, and in 3D how fast turning goes and speeds up; `speed_factor` (the character's part of the game's speed), `eye` (3D: the eyes, part of the height of a wall), `step_tiles` (the length of a step of the mouse, or of the character at its top speed: its steps grow with its speed; null for the arrow) |
| `food_kinds` | the food each food room shows: `cheese` or `bread` |
| `sound` | `on_at_start`, and `toggles`: every switch during the game, `{t, step, on, by}` |
| `path`, `known_rooms` | the room of every step from step 0, and the rooms the player knew at the end (what the end page draws) |
| `walks_back` | every time the player went out into a door or corridor and back into the same room: `{left_at, back_at, step (steps taken before), room, toward, move, furthest (the share of the way to the next room's floor reached)}` |
| `maze_def` | the maze as the game had it: `rooms` (colour numbers, -1 for no room) and, for a maze of the team, `team`: its drawing (`shape`), `start`, `food` (cheese and bread rooms), `moves`, `saved_by`, `saved_at` |
| `started`, `started_at`, `ended` | `ended`: `{how, step, moves, idle_stays, space_stays, at}`: how is `finished`, `starved` or `page closed` (then `at` is when the page closed); `step` the steps of the world (moves and stays), `moves` the moves, `idle_stays` and `space_stays` the stays standing still and by Space |
| `track` | the place and the view of the player every `track_ms` (100) during the game: `{every_ms, fields, rows}`, a row `[t, x, y, angle, step, look, look_d, look_share, music, tilt, back]` taken at the first screen frame from each mark on (so about 100 ms apart, more while the tab is hidden): `x`, `y` in tiles from the top left of the maze (a room is 4 tiles, a corridor 3, `x` to the right, `y` down), `angle` the way the player looks in degrees (0 east, 90 south; null in 2D), `step` the steps taken by then; `look` the place of the painting in the middle of the view (3D, see `gallery`; null when none is, and in 2D), `look_d` how far away it is (tiles), `look_share` how much of the width of the screen it covers (0 to 1); `music` how loud the gramophone is where the player is (0 to 1; null when it does not play); `tilt` how far the view looks up (the horizon that far below the middle of the screen, as a share of its height: 0 to 0.42; null in 2D), `back` how far the view stepped back from the player (tiles, 0 to 1; 0 with the camera behind; null in 2D). Null when `track_ms` is 0. Not in the short form |
| `steps` | 1 row per step, step 0 being the start (below) |
| `turns` | 3D: every turn, `{t, step (steps taken before it), key, from, to, from_angle, to_angle, ms, held_ms}`: `from` and `to` are the doors faced (`RIGHT`, `DOWN`, `LEFT`, `UP`), the angles in degrees (0 east, 90 south), `held_ms` how long the key was held. A turn still going on when a step is taken ends there (`split`), and the rest is a turn of its own (`continued`, with no key press of its own) |
| `gallery_seed` | the seed the paintings were hung and the music room and its records picked with |
| `gallery` | 3D: the paintings on the walls: `{source (paintings, or landscapes with game.paintings false), likes (whether plaques hang), places}`, a place `{place, room, side, painting, artemis}`: its number (place k is side k % 4 of the room k / 4 in the order of `maze_def`, sides `east`, `south`, `west`, `north`), the room, the side of the room the wall is on, the painting (its id in `js/paintings.js`, or `landscape_<n>`) and its name in ArtEmis. Null in 2D |
| `looks` | 3D: every painting seen during the game: `{place, painting, room, side, look_ms, looks, seen_ms, first_seen_at, first_look_at, nearest, liked, likes}`: how long it was in the middle of the view (up to 6 tiles away) in all, in how many looks, how long any of it was on the screen, when it was first on the screen and first looked at, how near (tiles) the player came while looking at it, whether it was liked at the end, and how often it was liked or un-liked. Times are frames of the screen added up (a frame counts at most 250 ms). Null in 2D |
| `likes` | 3D: every like and un-like: `{t, step (steps taken before it), place, painting, room, side, liked, by, d}`: `liked` true for a like, false when it was taken back, `by` `L` (the painting in the middle of the view) or `click` (its plaque), `d` how far away the painting was (tiles). Null in 2D |
| `clicks` | every click on the view during the game: `{t, step, x, y (CSS pixels on the view), on (plaque, gramophone or null), place, outcome (like, unlike, music on, music off, ignored: not at the gramophone, nothing)}` |
| `music` | the music room: `{room, pieces (the records in the order they come), plays}`, a play `{piece, started_at, step, by (P or click), stopped_at, stopped_by (P, click, ended, game over, or failed: why), played_s (seconds of it played)}`. Null with `game.music_room` false |
| `render` | 3D: the sharpness: `{renderer, gpu, webgl, levels, fixed_level, screen {width, height, pixel_ratio}, at_start {level, width, height}, level, width, height (at the end, the picture's pixels), changes, draw_ms, frame_ms}`; `fixed_level` the level the link kept (`?level=`; null); `renderer` is `webgl2` or `webgl` (the graphics card drew the view) or `canvas` (the ray casting), `gpu` the graphics card as the browser names it (null when it does not say, and for `canvas`), `webgl` why the ray casting drew (`none`: the browser has no WebGL, `software`: only WebGL drawn by the processor, `off`: the link `?gl=0`; null for WebGL); a change `{t, level, scale, width, height, why (slow, fast, window size, start), draw_ms (canvas) or frame_ms (WebGL)}`; `draw_ms` the median and 90th percentile time the page took for a drawing, how many drawings, and (canvas) the ray casting's and the rest's share at the end; `frame_ms` (WebGL) the median and 90th percentile time from a drawing to the next screen frame (long when the graphics card is slow), and how many. Null in 2D |
| `result` | the game as a model run: `settings` (world, run, satiety) and `rows` as in `forage.v3.record`, for `forage.lab.measures.of_run`; laid over the defaults of `forage.v3.settings` they are valid settings of a model run |

A row of `steps` (step 0 is the start: no key, move or times, nothing paid,
`legal` the moves open from the start room):

| Key | |
|---|---|
| `step` | 0 for the start, then 1, 2, ... |
| `shown_at` | when the screen of this choice was on the screen |
| `shown_at` | when the player could act: the room before entered (or the stay before over), or the game shown for step 1 |
| `key_at`, `decision_ms` | when the walk to this room began (when the player last set off from standing, or the room before was entered while walking on), and the time since `shown_at`; for a stay, when Space was pressed |
| `entered_at`, `left_at` | when the step was taken: the floor of the room entered (for a stay, Space pressed); the world changes then. And when the player left the floor of the room before |
| `by` | how the step came: `walk` (a room entered), `Space`, or `idle` (a second with no key held) |
| `held`, `press_at`, `stops`, `walked_tiles` | whether the walk began with a key held on from before the step before, when that key was pressed (null for an idle stay), how often the player stood still since the step before, and how far the player walked |
| `kept`, `full` | the food room not eaten from on this step because the player was full there, and whether nothing was paid because the player was full (`stomach.when_full: "stop"`) |
| `arrived_at` | for a stay, its time (a stay is at once) |
| `released_at`, `hold_ms`, `released_by` | when the key was let go, and for how long it was held after the step; `released_by: blur` when the window lost the keyboard while it was down |
| `key`, `move` | `ArrowUp`, ... or `Space`; `UP`, `DOWN`, `LEFT`, `RIGHT` or `STAY` |
| `facing_before`, `facing`, `angle_before`, `angle`, `turns_before` | the way the player faced when the walk began and at the step (`RIGHT`, `DOWN`, `LEFT`, `UP`; in 2D the way walked), in 3D also as angles in degrees (0 east, 90 south), and the turns made since the step before (3D) |
| `room_from`, `room_to`, `room` | rooms as `s<row><column>`, `s00` top left |
| `legal` | the moves open from the room the choice was made in |
| `walls_before`, `other_keys_before` | keys towards a wall, and other keys, pressed while choosing |
| `paid`, `cost`, `food_lost`, `energy`, `eaten` | food eaten on the step, its energy cost, food lost to a full stomach, energy after the step, food eaten so far |
| `levels` | the true level (0 to 1) of every food room after the step, also the ones the player cannot see |
| `change` | what happened to each food room: `eaten`, `refilled`, `skipped` (random refill) or `kept (full)` (the player was full there) |
| `draw` | the step's random draw |
| `in_food_room`, `seen`, `shown` | the food room the player is in, its level, and what the bar showed (`74%`, or `part full`) |
| `energy_shown`, `steps_left` | what the bar showed: the energy and the moves left (with `count_steps: "all"` the steps left) |
| `moves` | the moves taken so far, this step included |
| `corner` | true for a room crossed at its corner (see What is a step), taken together with the move after it |
| `known_new`, `known_food_new` | the rooms the player is shown from this step on (at step 0 the start room; then the room entered and the rooms next to it), and the food rooms among them |
| `found`, `events` | a food room entered for the first time on this step, and events: `known` (a food room shown for the first time), `found`, `empty`, `full again`, `refill skipped`, `food lost`, `full` (the bar full in a food room: eating stops) |

`keys`: every key press and release: `t`, `type` (`down` or `up`), `key` (as
the browser names it; Space is `" "`), `code`, `repeat`, `repeats` (how many
times the browser repeated the press while the key was held; the repeats are
not recorded 1 by 1), `with` (Shift, Ctrl, Alt, Meta, when held), `phase`
(`menu`, `game 3`, `end 3`) and `outcome`: in a game `walk`, `back` (3D, the
down arrow), `stay`, `turn`, `not allowed` (a move on a first step that must
be a stay), `ignored: too soon`, `ignored: key`,
`ignored: with Ctrl, Alt or Meta`, and for L and P `like`, `unlike`,
`ignored: no painting in view`, `ignored: no likes`, `music on`, `music off`,
`ignored: not at the gramophone`, `ignored: no music room`; on the first page `view`, `maze`, `row`, `play`, `ignored: not
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

## The team's data page

`analysis.html` (on the site: `.../foraging-game/analysis.html`) turns game
files into tables for the research: 1 row for each observation, 1 table for
each kind of observation, ready for Excel, SPSS, R or Python. It is not
linked from the game.

- **The password** is the team password, the one the team saves mazes with:
  the page opens when it unlocks the team's key (`js/team_key.js`), so it
  needs saving set up once in the maze editor. The password is not kept;
  Lock, or closing the page, locks it again. The site is public, so the
  password keeps others off the page, not from the data: the data are the
  game files, and only the team has them (the study's Drive folder).
- **The files:** download the games from the Drive folder (a folder of them,
  or the zip Drive makes of it) and drop them on the page, or choose them.
  They are read in the browser; nothing is sent anywhere. Files that are not
  games are listed and left out; test games (`TEST_`) are left out unless
  ticked (or unless all the games are tests).
- **What it shows:** the games, sortable, and for each its facts, its route on
  the maze (as on the end page), its energy and the food rooms' levels step
  by step, its visits to food rooms and its steps.
- **Downloads:** an Excel workbook (a sheet for each table, an `about` sheet
  and a `dictionary` sheet that says what every column holds), and a zip of
  CSV files for SPSS, R or Python (a CSV for each table, `dictionary.csv`,
  a `README.txt`, and for SPSS a `<table>_labels.sps` that gives the
  variables their labels after the CSV is opened).

The tables (`js/tables.js`; every column is described on the page and in the
dictionary):

| Table | 1 row |
|---|---|
| `games` | a game: who, the condition, maze, view and character, how it ended, the food eaten and lost, energy, decisions, exploring (rooms entered, the step by which half and all of them were, revisits, straight returns), each food room (its room, when found, visits, stays, food eaten), paintings, likes, music, the browser |
| `steps` | a step of the world, step 0 the start: the move and how it came, rooms, times, decision time, food paid, energy, what was shown, events, and the true level of each food room |
| `food` | a step and a food room: its level, what happened to it, whether the player was in it and knew it |
| `visits` | a visit to a food room, from the step that entered it to the last step in it: stays, seconds, the level before and the level left, food eaten, energy before and after, whether the bar was full, the travel since the last visit and since the last visit to the same room |
| `navigation` | a move from room to room: the rooms, the direction, a new room or a room been in before (how often), straight back, rooms entered and known so far, the shortest way from the start and to the nearest food room, decision and walking times |
| `track` | every 100 ms: the place (tiles), the view, the painting looked at, the record playing |
| `keys`, `turns` | a key pressed or let go, a turn in 3D |
| `looks`, `likes`, `clicks`, `music` | a painting seen (with its painter and title), a like, a click on the view, a record played |
| `page` | the window losing or getting back the keyboard, the sound switched |

Every table begins with `file`, `player`, `session` and `game`, so tables
join on them. Times are seconds from the start of the game; yes and no are 1
and 0; an empty cell has no value. The tables come from the files alone, so
the files of older versions (from format 9) read the same way.

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
- One rule is the game's own: with `stomach.when_full: "stop"` (the default)
  a player whose bar is full in a food room eats no more there until it
  walks out: that room is neither eaten from nor paid for on those steps
  (`kept`, `full`). The model eats on; `check/data_check.py` replays such
  steps the game's way. `"keep"` plays exactly as the model.
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
node check/play_check.js out/        # games in Chromium, 2D and 3D (needs Playwright; about 80 minutes;
                                     # --only hold,closed for some scenarios, --files out/ to check saved files again)
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
- a 3D game played to its last move, with turns, where stays do not use up moves;
- running out of energy, with keys pressed during stays;
- keys held down in 2D and 3D: walking on from room to room, steering while
  walking, stays repeated, the sound switched with M and with the button, and
  the route map drawn at the end;
- the environments of the model in both views, starting anywhere, with
  cheese and bread, and the settings that take rooms and steps from an
  environment file;
- every step counted as in the model (`count_steps: "all"`);
- a room crossed at its corner: a move, and the game goes on;
- the maze editor, with GitHub stood in for: a cut-off maze in
  `js/my_mazes.js` left out and listed, a maze drawn and its checks, tries in
  3D (left with Esc) and 2D (to its end), saving set up on the way (a short
  password refused, the key stored locked), the page opening again with the
  maze, a second save with someone else saving in between, a wrong password
  and a taken name refused, then a player's game in the saved maze;
- no condition from DataPipe, and DataPipe down with the file sent on the next visit;
- a tab closed in the middle of a game, then the partial game sent;
- the page opened from a file, with a character (its model, clips and sounds);
- the team's data page: locked, a wrong password refused and the right one not
  kept; 2 short games opened as a file and as a zip, a file that is no game
  left out; every table as node makes it from the same files; a game's map
  and energy drawn; the workbook (a sheet for each table) and the CSV zip
  (with the dictionary and the SPSS labels); Lock forgetting the files;
- the characters: each chosen on its page, in 3D behind it, through its eyes
  and in 2D, its model in, its speed and steps, its eating coming in and
  going again; the knight with the 3D view below level 0 (`?level=3`: drawn
  into a buffer, the canvas keeping its size); without WebGL the mouse, and why;
- the mouse in all 3 views, with the camera behind it checked at every place
  of the track (never in a wall, never with a wall between it and the mouse),
  and the arrow player of the versions before 2.4.0 in 2D and 3D;
- the paintings: a painting looked at and liked with L, L pressed again and
  again while standing (the stays go on every second), a plaque clicked;
- the music room in 2D and 3D: P at the gramophone, P a room away (nothing),
  the music fading on the way out, a click on the gramophone to stop it.

In every game the bot presses L and P now and then and clicks the view.
Every file is checked: in 3D the paintings hung as the game's seed says
(every wall another painting), the likes as the keys and clicks say, the
looking as long as the track says, the sharpness recorded; in both views the
music room as the seed says (never the start or a food room), the records in
their order, 1 at a time, and stopped by the end of the game.

`data_check.py` replays every game file through the model's world, checks
its settings are those of a valid model run, scores it with the model's
measures, checks the rooms shown at each step against the rule above, and
checks the fields DataPipe's validation needs.
