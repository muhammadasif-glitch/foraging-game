/* The team's own mazes, drawn in the game's maze editor (open the game with
 * ?edit=1) and saved here by its "Save to game" button. Each maze is drawn as
 * rows of rooms: . a room, # no room, S the start, C the cheese room, B the
 * bread room. A saved maze is not changed afterwards; an edited one is saved
 * under a new name. See js/maze_tools.js. */
(function (root) {
  var FG = root.FG = root.FG || {};
  FG.TEAM_MAZES = {
    "test": {
      "shape": [
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . S . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . C . . . . . . .",
        ". . . . . . . . B . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . ."
      ],
      "moves": 120,
      "saved_by": "Asif",
      "saved_at": "2026-10-20T11:10:15.027Z"
    },
    "test2": {
      "shape": [
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . .",
        ". . . . . . . . . . ."
      ],
      "moves": 120,
      "saved_by": "main",
      "saved_at": "2026-10-20T12:18:21.582Z"
    },
    "g": {
      "shape": [
        ". . .",
        ". . .",
        ". . .",
        ". . .",
        ". B S",
        ". . C"
      ],
      "moves": 120,
      "saved_by": "main",
      "saved_at": "2026-10-20T15:35:07.645Z"
    },
    "test3": {
      "shape": [
        ". . B . . . . .",
        ". S . C . # # #"
      ],
      "moves": 120,
      "saved_by": "main",
      "saved_at": "2026-10-21T09:10:29.651Z"
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
