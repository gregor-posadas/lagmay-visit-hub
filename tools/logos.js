// The supporter logos, in the order every logo row and strip uses. '|' is the divider between
// Dr. Lagmay's home institutions and the Berkeley (and Stanford) supporters.
// Oct 28: added CITRIS and the Banatao Institute (co-sponsor, waived the room fee) and the ASUC Office of Senator Torres.
const LOGOS = ['up', 'upri.jpg', 'noah', '|', 'blum', 'deveng', 'citris', 'townsend', 'goldman-block', 'osgt', 'bcp', 'stanford-sea'];
function logoRow(base) {
  return LOGOS.map(n => n === '|' ? '<span class="sep"></span>'
    : `<img src="${base}event/img/logos/logo-${n.includes('.') ? n : n + '.png'}" alt="">`).join('');
}
// Shrinks the logo height in a row until it fits on one line (run inside the page).
const FIT = `(sel, h) => { const row = document.querySelector(sel); const imgs = row.querySelectorAll('img');
  for (; h > 10; h -= 1) { imgs.forEach(i => i.style.height = h + 'px'); if (row.scrollWidth <= row.clientWidth) return h; } return h; }`;
module.exports = { LOGOS, logoRow, FIT };
