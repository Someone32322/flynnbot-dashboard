/* public/js/legal.js — TOC scroll highlighting for legal pages */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('.toc-link');
    var sections = document.querySelectorAll('.legal-section');
    if (!links.length || !sections.length) return;

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('active'); });
          var id = e.target.id;
          var active = document.querySelector('.toc-link[href="#' + id + '"]');
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });

    sections.forEach(function (s) { obs.observe(s); });

    // Animate sections in on scroll
    var fadeObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('legal-section--visible');
          fadeObs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -60px 0px' });

    sections.forEach(function (s) { fadeObs.observe(s); });
  });
}());
