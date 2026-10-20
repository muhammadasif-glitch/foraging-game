/* The GitHub key the maze editor saves mazes with, locked with the team
 * password (PBKDF2-SHA256 and AES-GCM in the browser), so that only someone
 * who knows the password can save. Written by the editor when saving is set
 * up; null until then. See js/team_save.js. */
(function (root) {
  var FG = root.FG = root.FG || {};
  FG.TEAM_KEY = {
    "repo": "muhammadasif-glitch/foraging-game",
    "branch": "main",
    "iterations": 600000,
    "salt": "P8PdXQh2YQ78X4m6K/UimA==",
    "iv": "RwiaHQ7QrjKmD7B1",
    "data": "4FcSLPvi4w0JFeiSB/9PTGN3IPn/eRQbv3bXolJ1nPQBWZNoN6KTpZxRurx6gDJkxhl5pLRG0nNf1oZwqKNeow6GX0gn4vWHifDhjvXbSOWd/c1GtDtdl4GkEkuDe01QllhOsMEUjZtmaHtDPw==",
    "made_at": "2026-10-20T11:10:15.925Z"
  };
})(typeof window !== "undefined" ? window : globalThis);
