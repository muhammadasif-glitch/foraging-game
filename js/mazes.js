/* The mazes of the model (forage.v3.settings.MAZES), written by
 * check/export_mazes.py: each number is a room and its colour, -1 no room.
 * Run that script again rather than changing this file. */
(function (root) {
  var FG = root.FG = root.FG || {};
  FG.MAZES = {
    "grid_4x4": {
      rooms: [
        [0, 1, 2, 3],
        [7, 6, 5, 4],
        [8, 9, 10, 11],
        [12, 13, 14, 15]
      ],
      colours: [
        "#00fe00", "#3232fe", "#7027c2", "#fefe00", "#646464", "#733c3c",
        "#fe00fe", "#509050", "#c883e1", "#4bb5db", "#fe9833", "#fecbe4",
        "#989800", "#e4fecb", "#cbcbfe", "#009898"
      ]
    },
    "grid_6x6": {
      rooms: [
        [0, 1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10, 11],
        [12, 13, 14, 15, 16, 17],
        [18, 19, 20, 21, 22, 23],
        [24, 25, 26, 27, 28, 29],
        [30, 31, 32, 33, 34, 35]
      ],
      colours: [
        "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a",
        "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "#c49c94",
        "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22", "#dbdb8d",
        "#17becf", "#9edae5", "#393b79", "#5254a3", "#6b6ecf", "#9c9ede",
        "#637939", "#8ca252", "#b5cf6b", "#cedb9c", "#8c6d31", "#bd9e39",
        "#e7ba52", "#e7cb94", "#843c39", "#ad494a", "#d6616b", "#e7969c"
      ]
    },
    "grid_two_4x4": {
      rooms: [
        [0, 1, 2, 3, -1, 17, 18, 19, 20],
        [4, 5, 6, 7, 16, 21, 22, 23, 24],
        [8, 9, 10, 11, -1, 25, 26, 27, 28],
        [12, 13, 14, 15, -1, 29, 30, 31, 32]
      ],
      colours: [
        "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a",
        "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "#c49c94",
        "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22", "#dbdb8d",
        "#17becf", "#9edae5", "#393b79", "#5254a3", "#6b6ecf", "#9c9ede",
        "#637939", "#8ca252", "#b5cf6b", "#cedb9c", "#8c6d31", "#bd9e39",
        "#e7ba52", "#e7cb94", "#843c39"
      ]
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
