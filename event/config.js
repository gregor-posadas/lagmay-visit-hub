// Event page settings.
// apiUrl: the same Apps Script /exec link as the hub. The page asks it only for anonymous counts (action=map).
// rsvpUrl: the Google Form's share link, logged by createRsvpForm() in Apps Script. Until it is set, the RSVP button says so.
// Add ?sample to the address to see the map with made-up people (for testing and rehearsal).
window.EV_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbwzr5dKY7SYF8xUqL_0JkgbBGhuGas3v0OHo-DEoB9bmjSg3s6SylZh_UWmd6S7EdSZ/exec",
  // connectUrl: the Connect form's share link, logged by createConnectForm() in Apps Script. Until it is set, the button says sign-up opens soon.
  connectUrl: "",
  rsvpUrl: "https://docs.google.com/forms/d/e/1FAIpQLSep5CC-7wR6JnsLgJwK2Sqd3Uy3FxqaIgfCPndmfU0bHdDDew/viewform",
  timeText: "4 to 5 PM Pacific",
  // Start and end in Pacific time, 24-hour. Add to calendar and the countdown use these. If either is left blank,
  // the calendar event becomes all-day on Nov 9 and says the time is to be announced.
  startTime: "16:00",
  endTime: "17:00",
  timeTextFil: "4 hanggang 5 ng hapon (oras sa California)",
  refreshSeconds: 60,
  // Supporters shown on the page once they've said yes. Set torres to true when Senator Torres's office agrees to be listed,
  // phildev is true: PhilDev committed Oct 7 (co-host; covers Banatao and the reception).
  supporters: { torres: false, phildev: true }
};
