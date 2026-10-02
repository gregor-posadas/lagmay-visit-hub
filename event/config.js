// Event page settings.
// apiUrl: the same Apps Script /exec link as the hub. The page asks it only for anonymous counts (action=map).
// rsvpUrl: the Google Form's share link, logged by createRsvpForm() in Apps Script. Until it is set, the RSVP button says so.
// Add ?sample to the address to see the map with made-up people (for testing and rehearsal).
window.EV_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbwzr5dKY7SYF8xUqL_0JkgbBGhuGas3v0OHo-DEoB9bmjSg3s6SylZh_UWmd6S7EdSZ/exec",
  rsvpUrl: "https://docs.google.com/forms/d/e/1FAIpQLSep5CC-7wR6JnsLgJwK2Sqd3Uy3FxqaIgfCPndmfU0bHdDDew/viewform",
  timeText: "Afternoon, time to be announced",
  refreshSeconds: 60
};
