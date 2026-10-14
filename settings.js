/* The settings of the game: everything a study changes is here.
 *
 * The keys have the names of the experiment files of the forage command
 * (active-inference-foraging), so that a game and a model run are set up the
 * same way. A game's settings are put together in this order, each on top of
 * the one before:
 *
 *   game          what every game has
 *   a condition   the version of the game a player gets (conditions below)
 *   a game plan   what 1 game of the session changes (session below)
 *   the link      ?set.<key>=<value>, for trying things out: ?set.maze=grid_6x6
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

    // Every game, unless a condition or a game plan changes it.
    game: {
      maze: "grid_4x4",           // grid_4x4, grid_6x6 or grid_two_4x4 (js/mazes.js)
      steps: 120,
      first_step_stay: false,     // true: step 1 can only be a stay, as in the model's runs
      start_rooms: "random",      // random, or a room such as "s00"
      start_area: 4,              // random start rooms only in rows and columns 0 to 3, where the model's agents can start
      food_rooms: {               // room: "random" (never the start room, never 2 in 1 room) or a room such as "s33"
        patch: {room: "random", worth: 8.0, start_level: 1.0},
        small: {room: "random", worth: 1.0, start_level: 1.0}
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
        map: "found",             // found: rooms appear once visited; full: the whole maze from the start
        level: "exact",           // exact: how full a food room is, in %; bin: only empty, part or full
        near: true,               // true: from the first step on, the rooms next to the player's room appear
                                  // on the map and stay, a food room with its food sign, as the model's agent
                                  // learns them; false: a food room is marked only once it has been visited
        worth: true,              // the food sign shows the room's worth (the most food it gives in a step)
        food_gained: true,        // a short "+0.9" when food is eaten
        steps_left: true
      },
      memory_test: true           // after the game: where were the food rooms, and how full are they now
    },

    // The versions of the game, in the order DataPipe numbers them: the first
    // is DataPipe's condition 0, the second condition 1, and so on. A link
    // that names none gets one from DataPipe (see if_no_condition above).
    conditions: {
      linear_fast: {food: {rule: "linear", half_empty_in: 2, refill_speed: "same"}},
      exponential_slow: {food: {rule: "exponential", half_empty_in: 20, refill_speed: "same"}}
    },

    // The games of 1 session, in order. kind: practice (a fixed layout, marked
    // practice in the data), shared (a fixed layout and seed, the same for
    // every player), new (a new random layout), repeat (the layout of an
    // earlier game again, of: its number in this list, from 1). Any key of
    // game above can be changed for 1 game here.
    session: [
      {kind: "practice", steps: 30, memory_test: false,
        layout: {start_room: "s00", food_rooms: {patch: "s21", small: "s02"}}},
      {kind: "shared", seed: 734501,
        layout: {start_room: "s30", food_rooms: {patch: "s03", small: "s12"}}},
      {kind: "new"},
      {kind: "new"},
      {kind: "new"},
      {kind: "repeat", of: 3}
    ],

    // What the player reads. {name} is filled in from the settings of the game.
    texts: {
      title: "Food rooms",
      consent: [
        "<p><b>Replace this text with the consent text of your institute.</b></p>",
        "<p>It should say what the study is, that taking part is voluntary, what is recorded",
        "(every key you press and when, and where you go in the game) and how the data is kept.</p>"
      ].join("\n"),
      consent_question: "Press <b>Y</b> if you agree to take part, or <b>N</b> if you do not.",
      declined: "<p>You chose not to take part. Nothing was recorded. You can close this page.</p>",
      code_question: "Type your player code and press <b>Enter</b>.",
      instructions: [
        "<p>In this game you walk through a building of rooms, one step at a time.</p>" +
        "<p>Some rooms hold food. The food rooms can be in other places in every game.</p>",
        "<p>Move with the <b>arrow keys</b>. Press <b>Space</b> to stay where you are.</p>" +
        "<p>The open sides of your room show where you can go. {map_text} {worth_text}</p>",
        "<p>Your <b>energy</b> is shown on the right. It starts at {start} and holds at most {size}. " +
        "Every move costs {move_cost}, staying costs {stay_cost}. Food fills it up again; " +
        "food beyond a full bar is lost. {at_zero_text}</p>",
        "<p>Every step you are in a food room, you eat from it: the fuller it is, the more you get. " +
        "Its food runs down while you stay, and grows back while you are away. You only see how full " +
        "a food room is while you are in it.</p>",
        "<p>Your goal: collect as much food as you can without running out of energy.</p>" +
        "<p>Each game has {steps} steps. After each game there are a few quick questions.</p>" +
        "{first_game_text}"
      ],
      map_near: "From your first step on, the rooms next to your room appear on the map and stay there. " +
        "A room with food shows a food sign.",
      map_visited: "Rooms appear on the map once you have been in them. You find out which rooms hold food " +
        "by walking in; a food room you have found shows a food sign.",
      worth: "The number on a food sign is the most food the room gives in one step, when it is full.",
      at_zero_end: "If it reaches 0, the game is over.",
      at_zero_continue: "If it reaches 0, it stays at 0 until you eat again.",
      start_practice: "Press <b>Space</b> to start the practice game.",
      start_first: "Press <b>Space</b> to start the first game.",
      first_practice: "<p>First a short practice game.</p>",
      first_step_stay: "On the first step you can only stay: press <b>Space</b>.",
      next_game: "Press <b>Space</b> to start the next game.",
      memory_where: "Where were the food rooms? Move the frame with the arrow keys and press " +
        "<b>Enter</b> on each food room (Enter again removes it). Press <b>Space</b> when you are done.",
      memory_level: "How full do you think this food room is now? Press a key from <b>0</b> (empty) to <b>9</b> (full).",
      end_question: "In a few words: how did you play? Type your answer and press <b>Enter</b>.",
      thanks: "<p>Thank you for playing.</p>",
      saving: "Saving your data. Please keep this page open.",
      still_saving: "Still saving your data. Please keep this page open.",
      saved: "Your data is saved. You can close this page.",
      not_saved: "Your data could not be sent yet. It is kept in this browser and will be sent the " +
        "next time this page is opened in it.",
      not_saved_open: "Your data could not be sent yet. Please keep this page open: it keeps trying."
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
