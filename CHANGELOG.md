# Changes

## 2.1.0

- Walking: the player walks freely, as in other games, while a key is
  held: in 3D the up arrow walks where the player looks and the down arrow
  backwards, in 2D the arrows walk their way. The walk speeds up and slows
  down, slides along walls and into doors, and is guided to the middle of
  doors and corridors; the food stands in the way. In 3D the head bobs a
  little.
- A move is a step when the player walks onto the floor of the next room
  (the world changes then); out into a door or corridor and back is no step
  and is recorded in `walks_back`. A stay is a step when Space is pressed in
  a room; held, Space stays again after each stay.
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
