const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.pillars article, .about > *').forEach(element => {
    element.classList.add('reveal');
    observer.observe(element);
  });
  reducedMotion.addEventListener('change', () => {
    document.querySelectorAll('.reveal').forEach(element => element.classList.add('is-visible'));
    observer.disconnect();
  }, { once: true });
}
