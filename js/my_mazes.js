/* The team's own mazes, drawn in the game's maze editor (open the game with
 * ?edit=1) and saved here by its "Save to game" button. Each maze is drawn as
 * rows of rooms: . a room, # no room, S the start, C the cheese room, B the
 * bread room. A saved maze is not changed afterwards; an edited one is saved
 * under a new name. See js/maze_tools.js. */
(function (root) {
  var FG = root.FG = root.FG || {};
  FG.TEAM_MAZES = {};
})(typeof window !== "undefined" ? window : globalThis);
