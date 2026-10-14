/* The settings of the game: everything a study changes is here.
 *
 * The keys have the names of the experiment files of the forage command
 * (active-inference-foraging), so that a game and a model run are set up the
 * same way. A game's settings are put together in this order, each on top of
 * the one before:
 *
 *   game          what every game has
 *   a condition   the version of the game a player gets (conditions below)
 *   the link      ?set.<key>=<value>, for trying things out: ?set.steps=30
 *   the menu      the maze the player chooses
 *
 * Which condition a player gets: the link names it, ?condition=linear_fast,
 * or says ?condition=auto (also when it names none) to let DataPipe hand the
 * conditions out in turn, so that they stay balanced. For that, turn on
 * condition assignment in DataPipe with the number of conditions below.
 */
(function (root) {
  var FG = root.FG = root.FG || {};

  FG.SETTINGS = {
    datapipe: {
      experiment_id: "8VqzRqvROGn5",
      // when DataPipe cannot hand out a condition: "random" picks one, "stop"
      // shows an error and the player cannot start
      if_no_condition: "random"
    },

    // What the first page offers, in this order.
    menu: {
      views: ["2d", "3d"],        // 2d: the maze from above; 3d: from inside
      // the mazes of the model; environments made with its
      // tools/make_environment.py come in through check/export_mazes.py
      mazes: ["grid_4x4", "grid_6x6", "grid_two_4x4", "ring_5x5", "holes_6x6", "corridors_7x7"]
    },

    // Every game, unless a condition or the link changes it.
    game: {
      maze: "grid_4x4",           // set by the player's choice on the first page
      steps: 120,                 // or "environment": the steps the maze's environment file gives
      first_step_stay: false,     // true: step 1 can only be a stay, as in the model's runs
      sound: true,                // music and sounds when the session starts; the player
                                  // switches them with M or the button in the corner
      start_rooms: "random",      // random, a room such as "s00", or "environment": 1 of the start rooms
                                  // of the maze's environment file
      start_area: null,           // null: random start rooms anywhere; 4: only in rows and columns 0 to 3
      food_rooms: {               // room: "random" (never the start room, never 2 in 1 room), a room such
                                  // as "s33", or "environment": the room the maze's environment file gives;
                                  // food: what the room shows, cheese or bread
        patch: {room: "random", worth: 8.0, start_level: 1.0, food: "cheese"},
        small: {room: "random", worth: 1.0, start_level: 1.0, food: "bread"}
      },
      food: {
        rule: "linear",           // linear or exponential
        half_empty_in: null,      // steps after which a full room eaten from every step is half empty;
                                  // when given, it sets eat_per_step for the rule
        eat_per_step: 0.1,
        refill_speed: 0.05,       // or "same": the same as eat_per_step
        random_refill: false,     // true: a refill happens only with probability refill_chance
        refill_chance: 1.0,
        empty_below: 0.25,        // the levels shown as empty, part or full when show.level is "bin"
        full_above: 0.75
      },
      stomach: {
        start: 10.0,
        size: 20.0,               // the most energy; food beyond it is lost
        move_cost: 1.0,
        stay_cost: 0.25,
        at_zero: "end"            // end: the game ends when energy reaches 0; continue: it stays at 0
      },
      show: {
        level: "exact",           // exact: how full the food room you are in is, in %; bin: empty, part or full
        food_gained: true,        // a short "+0.9" when food is eaten
        steps_left: true
      }
    },

    // The versions of the game, in the order DataPipe numbers them: the first
    // is DataPipe's condition 0, the second condition 1, and so on. A link
    // that names none gets one from DataPipe (see if_no_condition above).
    conditions: {
      linear_fast: {food: {rule: "linear", half_empty_in: 2, refill_speed: "same"}},
      exponential_slow: {food: {rule: "exponential", half_empty_in: 20, refill_speed: "same"}}
    },

    // What the player reads.
    texts: {
      title: "Food Rooms",
      intro: "Walk through the rooms and eat to keep your energy up. A food room runs empty while you " +
        "eat from it and fills up again while you are away.",
      keys_2d: "<kbd>&larr;</kbd> <kbd>&uarr;</kbd> <kbd>&rarr;</kbd> <kbd>&darr;</kbd> move, hold to keep going &middot; " +
        "<kbd>Space</kbd> stay &middot; <kbd>M</kbd> sound",
      keys_3d: "<kbd>&uarr;</kbd> walk, hold to keep going &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> turn &middot; " +
        "<kbd>&darr;</kbd> turn around &middot; <kbd>Space</kbd> stay &middot; <kbd>M</kbd> sound",
      menu_keys: "<kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>&larr;</kbd> <kbd>&rarr;</kbd> choose &middot; " +
        "<kbd>Enter</kbd> play &middot; <kbd>M</kbd> sound",
      view_2d: "From above",
      view_3d: "From inside",
      finished: "The game is over",
      starved: "You ran out of energy",
      eaten: "food eaten",
      again: "Press <kbd>Enter</kbd> to go back to the menu.",
      route: "Your way through the maze",
      saving: "Saving your game...",
      still_saving: "Still saving your game. Please keep this page open.",
      saved: "Your game is saved.",
      not_saved: "Your game could not be sent yet. It is kept in this browser and sent the next time " +
        "this page is opened in it.",
      not_saved_open: "Your game could not be sent yet. Please keep this page open: it keeps trying."
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
