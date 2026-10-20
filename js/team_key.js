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
    "salt": "bWH+hZoPECDsyk5H20s2/A==",
    "iv": "GvoxFFk7EoLyhL85",
    "data": "ehHOGzfHdvtj6Gr8hYwYTXA3NswVtiHxuHTctbE8MyMZYc4XiHWOqe3eTS2yzJ+dTiw1JJ7NniiEjsGUdvQ5KHmn5sn1cPbFoBS2oKJlGONI3D152wNPrsGbGJ/e5JuSvO8h6Aj+NhMd0dFgjg==",
    "made_at": "2026-10-20T15:35:08.823Z"
  };
})(typeof window !== "undefined" ? window : globalThis);
