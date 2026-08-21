/**
 * LinkedIn-style work tenure: inclusive months from data-start / data-end.
 * data-end omitted or "present" → current month.
 * Optional data-place is appended after the duration.
 */
(() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseYM(value) {
    const [y, m] = String(value).split('-').map(Number);
    if (!y || !m) return null;
    return { y, m };
  }

  function nowYM() {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }

  function formatRange(start, end, isPresent) {
    const from = `${MONTHS[start.m - 1]} ${start.y}`;
    const to = isPresent ? 'Present' : `${MONTHS[end.m - 1]} ${end.y}`;
    return `${from} – ${to}`;
  }

  function formatDuration(start, end) {
    const months = (end.y - start.y) * 12 + (end.m - start.m) + 1;
    if (months < 1) return '1 mo';
    const yrs = Math.floor(months / 12);
    const mos = months % 12;
    const bits = [];
    if (yrs) bits.push(yrs === 1 ? '1 yr' : `${yrs} yrs`);
    if (mos) bits.push(mos === 1 ? '1 mo' : `${mos} mos`);
    return bits.join(' ');
  }

  function fill(el) {
    const start = parseYM(el.getAttribute('data-start'));
    if (!start) return;
    const rawEnd = (el.getAttribute('data-end') || 'present').trim().toLowerCase();
    const isPresent = rawEnd === '' || rawEnd === 'present';
    const end = isPresent ? nowYM() : parseYM(rawEnd);
    if (!end) return;
    const place = (el.getAttribute('data-place') || '').trim();
    const parts = [formatRange(start, end, isPresent), formatDuration(start, end)];
    if (place) parts.push(place);
    el.textContent = parts.join(' · ');
  }

  document.querySelectorAll('[data-start]').forEach(fill);
})();
