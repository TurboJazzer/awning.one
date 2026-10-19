/* Awning scorecard: combines individual checks into the four sub-scores and the overall score.
   Rules (approved 19 Oct 2026): Speed 30, Search 25, AI search 25, Mobile 20 = 100.
   Bands: 80+ Good, 50-79 Fair, under 50 Needs work.
   A check that could not be run has earned = null and is left out, not scored as zero:
   the category is scaled to the checks that did run. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AwningCompose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var CATS = { speed: 30, mobile: 20, search: 25, ai: 25 };
  function band(pct) { return pct >= 80 ? 'Good' : pct >= 50 ? 'Fair' : 'Needs work'; }
  function compose(checks) {
    var cats = {}, total = 0, maxChecked = 0;
    Object.keys(CATS).forEach(function (k) {
      var earned = 0, possible = 0, unchecked = 0;
      checks.forEach(function (c) {
        if (c.cat !== k) return;
        if (c.earned === null || c.earned === undefined) { unchecked += c.max; return; }
        earned += c.earned; possible += c.max;
      });
      if (possible === 0) { cats[k] = { max: CATS[k], score: null, pct: null, band: 'Could not check' }; return; }
      var score = earned / possible * CATS[k];
      var pct = Math.round(score / CATS[k] * 100);
      cats[k] = { max: CATS[k], score: Math.round(score * 10) / 10, pct: pct, band: band(pct), unchecked: unchecked };
      total += score; maxChecked += CATS[k];
    });
    var overall = maxChecked ? Math.round(total / maxChecked * 100) : null;
    var top = null, lost = 0;
    checks.forEach(function (c) {
      if (c.earned === null || c.earned === undefined) return;
      var l = c.max - c.earned;
      if (l > lost + 1e-9) { lost = l; top = c; }
    });
    return { total: overall, band: overall === null ? 'Could not check' : band(overall), cats: cats, topFix: top ? { label: top.label, fix: top.fix, points: Math.round(lost * 10) / 10 } : null };
  }
  return { compose: compose, band: band, CATS: CATS };
});
