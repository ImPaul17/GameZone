(function() {
  'use strict';

  /**
   * Extracts the user score from a Metacritic HTML page using multiple heuristics.
   * @param {string} html
   * @returns {number|null}
   */
  function parseUserScore(html) {
    if (!html) return null;

    try {
      // Normalize whitespace to make regex matching more robust
      const text = html.replace(/\s+/g, ' ');

      // Try multiple strategies to find a user score like 8.8
      const patterns = [
        /User Score[^0-9]*([0-9]\.[0-9])/i,
        /metascore_w[^>]*user[^>]*>([0-9]\.[0-9])<\/(span|div)>/i,
        /data-qa=["']?userScore["']?[^>]*>([0-9]\.[0-9])<\//i,
        /"userScore"\s*:\s*([0-9]\.[0-9])/i,
        /"score"\s*:\s*([0-9]\.[0-9])\s*,\s*"type"\s*:\s*"userscore"/i
      ];

      for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) {
          const val = parseFloat(m[1]);
          if (!isNaN(val) && val >= 0 && val <= 10) return val;
        }
      }

      // Fallback: look for a standalone X.Y near the term "User" or "Users"
      const nearUser = text.match(/User[s]?[^0-9]{0,50}?([0-9]\.[0-9])/i);
      if (nearUser && nearUser[1]) {
        const val = parseFloat(nearUser[1]);
        if (!isNaN(val) && val >= 0 && val <= 10) return val;
      }
    } catch (_) {
      // ignore parse errors
    }

    return null;
  }

  /**
   * Determine CSS class based on score value
   * @param {number} score
   */
  function getScoreClass(score) {
    if (typeof score !== 'number' || isNaN(score)) return 'score-mixed';
    if (score >= 8.5) return 'score-excellent';
    if (score >= 7.0) return 'score-good';
    if (score >= 5.0) return 'score-mixed';
    return 'score-poor';
  }

  /**
   * Build a CORS-friendly proxy URL using r.jina.ai.
   * @param {string} targetUrl
   */
  function buildProxyUrl(targetUrl) {
    const clean = String(targetUrl).trim();
    const noScheme = clean.replace(/^https?:\/\//i, '');
    // r.jina.ai requires the target scheme inside the path; https is widely supported by metacritic
    return `https://r.jina.ai/http://${noScheme}`;
  }

  /**
   * Attempt to fetch HTML through primary and fallback proxies.
   * @param {string} url
   */
  async function fetchHtmlThroughProxies(url) {
    const proxies = [
      () => fetch(buildProxyUrl(url), { headers: { 'Accept': 'text/html, */*;q=0.9' } }),
      () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { headers: { 'Accept': 'text/html, */*;q=0.9' } })
    ];

    let lastErr = null;
    for (const get of proxies) {
      try {
        const res = await get();
        if (res && res.ok) {
          return await res.text();
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error('No se pudo obtener el HTML de Metacritic');
  }

  async function updateCard(card) {
    try {
      const url = card?.dataset?.metacriticUrl || document.querySelector('meta[name="metacritic-url"]')?.content;
      if (!url) return; // no configuration provided

      const numberEl = card.querySelector('.score-number');
      const userScoreEl = card.querySelector('.user-score');
      const footerEl = card.querySelector('.metacritic-footer');

      if (numberEl) numberEl.textContent = '…';

      const html = await fetchHtmlThroughProxies(url);
      const score = parseUserScore(html);

      if (typeof score === 'number') {
        const cls = getScoreClass(score);

        if (userScoreEl) {
          userScoreEl.classList.remove('score-excellent', 'score-good', 'score-mixed', 'score-poor');
          userScoreEl.classList.add(cls);
        }
        if (numberEl) {
          numberEl.textContent = score.toFixed(1);
          numberEl.title = 'Fuente: Metacritic (actualizado en tiempo real)';
          numberEl.setAttribute('aria-label', `User Score ${score.toFixed(1)} en Metacritic`);
        }

        if (footerEl) {
          // Replace footer content with a source link to Metacritic
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Metacritic';
          a.style.color = 'var(--text-secondary)';
          a.style.textDecoration = 'none';
          footerEl.innerHTML = '';
          footerEl.appendChild(a);

          const ts = document.createElement('span');
          ts.textContent = ' • actualizado ahora';
          ts.style.marginLeft = '6px';
          ts.style.color = 'var(--text-muted)';
          footerEl.appendChild(ts);
        }
      } else {
        if (numberEl) numberEl.textContent = 'N/A';
        console.warn('No se pudo extraer el User Score de Metacritic');
      }
    } catch (err) {
      const numberEl = card.querySelector('.score-number');
      if (numberEl) numberEl.textContent = 'N/A';
      console.warn('Error al actualizar la puntuación de Metacritic:', err);
    }
  }

  function init() {
    const cards = document.querySelectorAll('.metacritic-card');
    if (!cards || cards.length === 0) return;
    cards.forEach(updateCard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();