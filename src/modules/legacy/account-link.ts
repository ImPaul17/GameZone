const accountNavigation = String.raw`<script data-gamezone-account-navigation="true">
(function () {
  var account = document.querySelector('[data-gamezone-account="true"]');
  var menu = account && account.closest('.nav-menu');
  var header = account && account.closest('header');
  var toggle = header && header.querySelector('.mobile-menu-toggle');
  if (!menu || !header || !toggle) return;
  var content = header.querySelector('.header-content');
  var search = header.querySelector('.search-container');
  var nav = header.querySelector('.nav');
  var support = header.querySelector('#kofi-widget-container');
  var supportParent = support && support.parentNode;
  var supportNext = support && support.nextSibling;
  var supportItem = null;
  var opened = false;
  var mobile = false;
  var menuStyle = menu.getAttribute('style');
  var toggleStyle = toggle.getAttribute('style');
  var originalStyles = [content, search, nav].map(function (element) { return element && element.getAttribute('style'); });
  function restore(element, style) {
    if (!element) return;
    if (style === null) element.removeAttribute('style');
    else element.setAttribute('style', style);
  }
  function close(returnFocus) {
    if (!opened) return;
    opened = false;
    restore(menu, menuStyle);
    if (mobile) menu.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    if (returnFocus) toggle.focus();
  }
  function positionMenu() {
    var top = Math.max(0, Math.ceil(header.getBoundingClientRect().bottom));
    Object.assign(menu.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', position: 'fixed',
      top: top + 'px', left: '16px', right: '16px', width: 'auto', margin: '0', padding: '12px',
      maxHeight: Math.max(0, window.innerHeight - top - 16) + 'px', overflowY: 'auto',
      gap: '4px', background: 'var(--bg-secondary, #1a1a1a)',
      border: '1px solid var(--border-color, rgba(110,185,43,.2))', borderRadius: '12px',
      boxShadow: 'var(--shadow-heavy, 0 15px 50px rgba(0,0,0,.3))', zIndex: '1001'
    });
  }
  function compactDesktop() {
    if (!content || !nav || !search) return;
    search.style.minWidth = '140px';
    function deficit() {
      return Math.max(0, nav.getBoundingClientRect().right - content.getBoundingClientRect().right + (parseFloat(getComputedStyle(content).paddingRight) || 0));
    }
    function compact(element) {
      var items = Array.from(element.children).filter(function (child) { return getComputedStyle(child).display !== 'none'; }).length;
      var gap = parseFloat(getComputedStyle(element).columnGap) || 0;
      var missing = deficit();
      if (missing > 0 && items > 1 && gap > 12) element.style.columnGap = Math.max(12, gap - Math.ceil(missing / (items - 1))) + 'px';
    }
    compact(content);
    compact(nav);
    compact(menu);
  }
  function layout() {
    if (window.innerWidth <= 1200) {
      if (!mobile) {
        mobile = true;
        if (content) Object.assign(content.style, { flexWrap: 'wrap', height: 'auto', padding: '1rem', gap: '1rem' });
        if (search) Object.assign(search.style, { order: '3', flex: '0 0 100%', width: '100%', maxWidth: 'none', marginTop: '0' });
        if (nav) nav.style.gap = '12px';
        toggle.style.display = 'block';
        menu.style.display = 'none';
        if (support) {
          supportItem = document.createElement('li');
          supportItem.className = 'nav-item';
          menu.appendChild(supportItem);
          supportItem.appendChild(support);
        }
      }
      if (opened) positionMenu();
    } else {
      if (mobile) {
        close(false);
        mobile = false;
        if (support && supportParent) {
          if (supportNext && supportNext.parentNode === supportParent) supportParent.insertBefore(support, supportNext);
          else supportParent.appendChild(support);
        }
        if (supportItem) supportItem.remove();
      }
      [content, search, nav].forEach(function (element, index) { restore(element, originalStyles[index]); });
      restore(menu, menuStyle);
      restore(toggle, toggleStyle);
      compactDesktop();
    }
  }
  menu.id = menu.id || 'gamezone-account-menu';
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', menu.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Abrir menú');
  toggle.addEventListener('click', function () {
    if (!mobile) return;
    if (opened) close(false);
    else {
      opened = true;
      positionMenu();
      var first = menu.querySelector('a');
      if (first) first.focus();
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Cerrar menú');
    }
  });
  document.addEventListener('keydown', function (event) {
    if (opened && event.key === 'Escape') { event.preventDefault(); close(true); }
  });
  document.addEventListener('click', function (event) {
    if (opened && !menu.contains(event.target) && !toggle.contains(event.target)) close(false);
  });
  menu.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (link && link.getAttribute('href').charAt(0) !== '#') close(false);
  });
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(layout);
  layout();
})();
</script>
`;

/** Adds account access while retaining the original document bytes outside the two marked additions. */
export function withAccountLink(html: string, enabled: boolean): string {
  if (!enabled || html.includes('data-gamezone-account="true"')) return html;
  if (!/<ul\b(?=[^>]*\bclass=["'][^"']*\bnav-menu\b)[^>]*>/i.test(html) || !/<\/body>/i.test(html)) return html;
  const entry = '<li class="nav-item"><a href="/cuenta.html" class="nav-link" data-gamezone-account="true" aria-label="Mi cuenta"><i class="fas fa-user" aria-hidden="true"></i> Mi cuenta</a></li>\n';
  // The repository's navigation lists use divs for dropdowns, without nested ul elements.
  return html.replace(/(<ul\b(?=[^>]*\bclass=["'][^"']*\bnav-menu\b)[^>]*>[\s\S]*?)(<\/ul>)/i, (_match, menu: string, closing: string) => menu + entry + closing)
    .replace(/<\/body>/i, (closing) => accountNavigation + closing);
}
