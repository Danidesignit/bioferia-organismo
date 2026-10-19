/* Panel de parámetros (tecla G). Sin dependencias: se arma desde CONFIG_UI. */
const GUI = (() => {
  let el;
  const ACTIONS = [
    ['add', 'Sumar pulso'], ['add10', 'Sumar 10'], ['auto', 'Auto'], ['theme', 'Tema'],
    ['copy', 'Copiar parámetros'], ['defaults', 'Restablecer'], ['reset', 'Reiniciar organismo'], ['png', 'Guardar PNG'],
  ];
  const decimals = (step) => (String(step).split('.')[1] || '').length;

  function build(onAction, onChange) {
    el = document.createElement('aside');
    el.id = 'gui';
    el.hidden = true;
    let html = '<header><strong>Parámetros <small id="fps"></small></strong><button data-act="close" aria-label="Cerrar">×</button></header><div class="body">';
    html += '<div class="acts">' + ACTIONS.map(([k, l]) => `<button data-act="${k}">${l}</button>`).join('') + '</div>';
    for (const g of CONFIG_UI) {
      html += `<details${g.open ? ' open' : ''}><summary>${g.group}</summary>`;
      for (const [k, label, min, max, step] of g.items) {
        html += `<label><span>${label}</span><input type="range" data-k="${k}" data-step="${step}" min="${min}" max="${max}" step="${step}" value="${CONFIG[k]}"><output>${(+CONFIG[k]).toFixed(decimals(step))}</output></label>`;
      }
      html += '</details>';
    }
    html += '<p class="keys">Espacio sumar · B ráfaga · A auto · T tema · H ocultar texto · F pantalla completa · S PNG · Shift+R reiniciar</p></div>';
    el.innerHTML = html;
    document.body.appendChild(el);

    el.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      CONFIG[k] = parseFloat(e.target.value);
      e.target.nextElementSibling.textContent = CONFIG[k].toFixed(decimals(e.target.dataset.step));
      onChange && onChange(k);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') toggle(false); else onAction(b.dataset.act);
    });
    refreshAuto();
  }

  function sync() {
    if (!el) return;
    el.querySelectorAll('input[data-k]').forEach((inp) => {
      inp.value = CONFIG[inp.dataset.k];
      inp.nextElementSibling.textContent = (+CONFIG[inp.dataset.k]).toFixed(decimals(inp.dataset.step));
    });
    refreshAuto();
  }

  function refreshAuto() {
    const b = el && el.querySelector('[data-act="auto"]');
    if (b) b.textContent = CONFIG.autoSimulate ? 'Auto: sí' : 'Auto: no';
  }

  function toggle(v) { if (el) el.hidden = v === undefined ? !el.hidden : !v; }

  return { build, sync, toggle, refreshAuto };
})();
