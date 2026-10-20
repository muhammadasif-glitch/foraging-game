/* The GitHub key the maze editor saves mazes with, locked with the team
 * password (PBKDF2-SHA256 and AES-GCM in the browser), so that only someone
 * who knows the password can save. Written by the editor when saving is set
 * up; null until then. See js/team_save.js. */
(function (root) {
  var FG = root.FG = root.FG || {};
  FG.TEAM_KEY = null;
})(typeof window !== "undefined" ? window : globalThis);
