/* ============================================================
   OPAL VIP — Before & After interactions
   Two INDEPENDENT behaviours:
     1) Vertical drag handle inside each card reveals before/after
     2) Horizontal carousel moves between the different cases
   ============================================================ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Per-card Before/After toggle (cross-fade) ---------- */
  function initCard(card) {
    var stage = card.querySelector('.ba-card__stage');
    var btns  = card.querySelectorAll('.ba-toggle__btn');
    var label = card.querySelector('.ba-card__state');
    if (!stage || !btns.length) return;

    function setMode(mode, userAction) {
      if (userAction) card._touched = true;   // user took over — cancel auto-demo
      var after = (mode === 'after');
      stage.classList.toggle('show-after', after);
      Array.prototype.forEach.call(btns, function (b) {
        var active = b.getAttribute('data-mode') === mode;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (label) label.textContent = after ? 'AFTER' : 'BEFORE';
    }
    // Expose so the auto-demo can drive this card.
    card._setMode = setMode;

    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        setMode(b.getAttribute('data-mode'), true);
      });
    });

    setMode('before');
  }

  // One-time auto cross-fade (Before -> After -> Before) so users discover
  // the comparison. Yields immediately if the user taps a toggle.
  function playCompareDemo(card) {
    var setMode = card._setMode;
    if (!setMode || card._touched || card._demoed) return;
    card._demoed = true;
    setTimeout(function () { if (!card._touched) setMode('after'); }, 200);
    setTimeout(function () { if (!card._touched) setMode('before'); }, 1600);
  }

  /* ---------- 2. Horizontal carousel between cases (infinite loop) ----------
     The loop is built by rendering THREE identical copies of the case set
     (setA | setB | setC). We keep the viewport inside the middle band; when a
     swipe/arrow drifts into an outer band we jump by exactly one set width.
     Because the sets are identical the jump is visually seamless, so swiping
     in either direction cycles forever. */
  function initCarousel() {
    var carousel = document.querySelector('.ba__carousel');
    var track    = document.getElementById('baTrack');
    var dotsWrap = document.getElementById('baDots');
    if (!carousel || !track || !dotsWrap) return;

    var originals = Array.prototype.slice.call(track.querySelectorAll('.ba-card'));
    var N = originals.length;
    if (N === 0) return;

    var prevBtn = carousel.querySelector('.ba__nav--prev');
    var nextBtn = carousel.querySelector('.ba__nav--next');

    // Clone the whole set before and after the originals -> 3 identical bands:
    //   [ beforeClones ][ originals ][ afterClones ]
    var firstOriginal = originals[0];
    originals.map(function (c) { return c.cloneNode(true); })
      .forEach(function (c) { track.insertBefore(c, firstOriginal); }); // setA, in order
    originals.map(function (c) { return c.cloneNode(true); })
      .forEach(function (c) { track.appendChild(c); });                 // setC, in order

    var cards = Array.prototype.slice.call(track.querySelectorAll('.ba-card'));
    // Make every card (clones included) an independent before/after slider.
    cards.forEach(initCard);

    var setWidth = 0;                 // width of one band in px
    var current  = N;                 // absolute index currently centered (start of setB)

    function measure() {
      setWidth = track.scrollWidth / 3;
    }

    function centerDelta(absIndex) {
      var t = track.getBoundingClientRect();
      var c = cards[absIndex].getBoundingClientRect();
      return (c.left + c.width / 2) - (t.left + t.width / 2);
    }

    function jumpToIndex(absIndex) {           // instant, no animation
      var prevBehavior = track.style.scrollBehavior;
      track.style.scrollBehavior = 'auto';
      track.scrollLeft += centerDelta(absIndex);
      track.style.scrollBehavior = prevBehavior;
    }

    function glideToIndex(absIndex) {          // smooth
      track.scrollBy({ left: centerDelta(absIndex), behavior: 'smooth' });
    }

    function centeredIndex() {
      var t = track.getBoundingClientRect();
      var center = t.left + t.width / 2;
      var best = 0, bestDist = Infinity;
      cards.forEach(function (c, i) {
        var r = c.getBoundingClientRect();
        var d = Math.abs((r.left + r.width / 2) - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    }

    // Dots: one per logical case.
    for (var i = 0; i < N; i++) {
      (function (li) {
        var b = document.createElement('button');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', originals[li].getAttribute('data-title') || ('Case ' + (li + 1)));
        b.addEventListener('click', function () { glideToIndex(N + li); });
        dotsWrap.appendChild(b);
      })(i);
    }
    var dots = Array.prototype.slice.call(dotsWrap.children);

    function updateDots(absIndex) {
      var logical = ((absIndex - N) % N + N) % N;
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === logical);
        d.setAttribute('aria-selected', k === logical ? 'true' : 'false');
      });
    }

    // Keep the viewport inside the middle band, wrapping seamlessly.
    // We wrap based on WHICH card is centred (not raw scrollLeft): as soon as
    // the centred card lands in an outer clone band, we instantly recentre on
    // the identical card in the middle band. This works for any card count and
    // any viewport width, and loops in BOTH directions.
    function wrapIfNeeded() {
      var idx = centeredIndex();
      if (idx < N || idx >= 2 * N) {
        var logical = ((idx - N) % N + N) % N;
        var target  = N + logical;
        var prevB = track.style.scrollBehavior;
        track.style.scrollBehavior = 'auto';
        track.scrollLeft += centerDelta(target);
        track.style.scrollBehavior = prevB;
        idx = target;
      }
      return idx;
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { glideToIndex(centeredIndex() - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { glideToIndex(centeredIndex() + 1); });

    // While scrolling we only update the dots (cheap, no layout jumps). The
    // seamless recentre jump is deferred until the scroll has actually settled
    // (~120ms idle) so it never interrupts an in-flight smooth glide — that
    // mid-animation jump was what made the loop wrap feel abrupt.
    var ticking = false;
    var scrollEndTimer;
    track.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateDots(centeredIndex());
          ticking = false;
        });
        ticking = true;
      }
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(function () {
        current = wrapIfNeeded();
        updateDots(current);
      }, 120);
    });

    function recenterCurrent() {
      measure();
      jumpToIndex(N + (((current - N) % N + N) % N));
    }
    window.addEventListener('resize', recenterCurrent);
    // Images/fonts can change band widths after first paint — re-centre once settled.
    window.addEventListener('load', recenterCurrent);

    // Boot: measure bands and centre the first real case.
    measure();
    jumpToIndex(N);
    updateDots(N);

    // Surprise: the first real card auto-sweeps once when it scrolls into
    // view, revealing that before/after can be dragged. Skipped for users
    // who prefer reduced motion.
    if (!prefersReduced && 'IntersectionObserver' in window) {
      var demoCard = cards[N];
      var demoIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            demoIO.disconnect();
            setTimeout(function () { playCompareDemo(demoCard); }, 450);
          }
        });
      }, { threshold: 0.65 });
      demoIO.observe(demoCard);
    }
  }

  /* ---------- 3. Scroll reveal (staggered fade/rise per section) ---------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;

    // Groups chosen to avoid revealing a parent AND its child (no nested
    // double-transform). The hero is animated separately in pure CSS.
    var selectors = [
      '.intro__content > :not(.btn-vip)',
      '.services__head > *', '.svc-card', '.cta-bar',
      '.ba__title', '.ba__carousel', '.ba__dots', '.ba__caption',
      '.priv__col',
      '.laser__content > :not(.laser__cards)', '.laser-card',
      '.welcome__inner > *',
      '.duration__inner > *',
      '.thanks__cards', '.thanks__content > *', '.thanks__footer > *'
    ];

    var els = [];
    selectors.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        if (els.indexOf(el) === -1) els.push(el);
      });
    });
    if (!els.length) return;

    // Local (per-parent) stagger so each section cascades on its own.
    var seen = (typeof Map !== 'undefined') ? new Map() : null;
    els.forEach(function (el, i) {
      el.classList.add('reveal');
      var key;
      if (seen) {
        key = seen.has(el.parentNode) ? seen.get(el.parentNode) : 0;
        seen.set(el.parentNode, key + 1);
      } else {
        key = i % 5;
      }
      el.style.transitionDelay = Math.min(key * 90, 480) + 'ms';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 4. Count-up on the big discount numbers ---------- */
  function initCountUp() {
    if (!('IntersectionObserver' in window)) return;
    var nums = document.querySelectorAll('.priv__pct, .laser-card__pct, .welcome__pct');
    if (!nums.length) return;

    function run(el) {
      var target = parseInt(el.getAttribute('data-target'), 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1400, start = null;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);        // easeOutCubic
        el.textContent = Math.round(eased * target) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        run(e.target);
      });
    }, { threshold: 0.6 });

    Array.prototype.forEach.call(nums, function (el) {
      var m = /^\s*(\d+)(.*)$/.exec(el.textContent);
      if (!m) return;
      el.setAttribute('data-target', m[1]);
      el.setAttribute('data-suffix', (m[2] || '').trim());
      el.textContent = '0' + (m[2] || '').trim();
      io.observe(el);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    // initCarousel clones the set and initialises every card (originals + clones).
    initCarousel();

    if (!prefersReduced) {
      initReveal();
      initCountUp();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
