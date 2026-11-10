/* Test de comprobación del simulador de tensión diferencial CAN.
   Se añade al final de la página y envía la nota con Seguimiento.resultado(). */
(function () {
  'use strict';
  const PREGUNTAS = [
    { p: 'En estado recesivo (bit 1), ¿qué tensiones hay en el bus CAN de alta velocidad?',
      r: ['CAN-H 2,5 V y CAN-L 2,5 V: diferencia 0 V', 'CAN-H 3,5 V y CAN-L 1,5 V: diferencia 2 V', 'CAN-H 5 V y CAN-L 0 V: diferencia 5 V', 'CAN-H 0 V y CAN-L 5 V'],
      e: 'En recesivo ningún transceptor empuja el bus y los dos cables quedan a 2,5 V.' },
    { p: 'En estado dominante (bit 0), ¿qué tensiones hay?',
      r: ['CAN-H 3,5 V y CAN-L 1,5 V: diferencia 2 V', 'CAN-H 2,5 V y CAN-L 2,5 V: diferencia 0 V', 'CAN-H 12 V y CAN-L 0 V', 'CAN-H 1,5 V y CAN-L 3,5 V'],
      e: 'El transceptor sube CAN-H y baja CAN-L a la vez, en espejo respecto a 2,5 V.' },
    { p: 'Con la batería desconectada mides entre CAN-H y CAN-L. ¿Qué valor indica que el bus está bien?',
      r: ['60 Ω', '120 Ω', '0 Ω', 'Infinito (circuito abierto)'],
      e: 'Son las dos resistencias de terminación de 120 Ω en paralelo. Si mides 120 Ω, falta una.' },
    { p: 'Al arrancar, la batería cae a unos 9–10 V. ¿Qué les pasa a los niveles del bus?',
      r: ['No cambian: el transceptor se alimenta de los 5 V del regulador de la centralita', 'Bajan en proporción a la batería', 'El bus se queda en dominante mientras dura el arranque', 'Suben para compensar la caída'],
      e: 'Mientras el regulador mantenga 5 V, los 2,5 V de reposo y los niveles dominantes no se mueven.' },
    { p: '¿Por qué una interferencia del encendido o de los inyectores no cambia el bit que lee el receptor?',
      r: ['Porque entra casi igual en los dos cables trenzados y el receptor solo mira la resta CAN-H − CAN-L', 'Porque las resistencias de 120 Ω la filtran por completo', 'Porque el receptor compara cada cable con la masa del motor', 'Porque el bus solo transmite con el motor parado'],
      e: 'La interferencia mueve la tensión media de los dos cables, pero la diferencia entre ellos no cambia.' },
    { p: 'El receptor mide una diferencia CAN-H − CAN-L de 1,6 V. ¿Qué bit lee?',
      r: ['0, dominante: está por encima de 0,9 V', '1, recesivo: está por debajo de 2 V', 'Ninguno: es un error de bus', '1, recesivo: está por encima de 0,5 V'],
      e: 'Por encima de 0,9 V lee dominante; por debajo de 0,5 V, recesivo.' },
  ];

  const css = document.createElement('style');
  css.textContent = `
.quiz{display:flex;flex-direction:column;gap:14px}
.quiz > p{margin:0;max-width:66ch;color:var(--muted)}
.q{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0}
.q legend{font-weight:700;padding:0;margin-bottom:10px;float:left;width:100%}
.q legend span{font-family:var(--font-mono);color:var(--muted);margin-right:6px}
.q label{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:9px;cursor:pointer;clear:both}
.q label:hover{background:var(--surface-2)}
.q input{margin-top:4px;accent-color:var(--accent);flex:none}
.q.ok{border-color:var(--ch-l)} .q.mal{border-color:var(--ch-bat)}
.q label.bien{background:color-mix(in srgb,var(--ch-l) 16%,transparent)}
.q label.fallo{background:color-mix(in srgb,var(--ch-bat) 16%,transparent)}
.q .exp{margin:8px 0 0;font-size:.92rem;color:var(--muted)}
.quiz-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.quiz-nota{font-family:var(--font-mono);font-weight:600;font-size:1.2rem}`;
  document.head.appendChild(css);

  const sec = document.createElement('section');
  sec.className = 'block quiz';
  sec.setAttribute('aria-labelledby', 'h-test');
  const foot = document.querySelector('.page > .foot');
  foot.parentNode.insertBefore(sec, foot);

  const mezclar = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let orden = [];

  function pintar() {
    orden = PREGUNTAS.map(q => mezclar(q.r.map((t, i) => ({ t, ok: i === 0 }))));
    sec.innerHTML = `<h2 id="h-test">Comprueba lo que has aprendido</h2>
      <p>${PREGUNTAS.length} preguntas sobre lo que has visto en la animación. Puedes repetirlo: cuenta tu mejor nota.</p>
      ${PREGUNTAS.map((q, i) => `<fieldset class="q" data-i="${i}"><legend><span>${i + 1}.</span>${q.p}</legend>
        ${orden[i].map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"> <span>${o.t}</span></label>`).join('')}
      </fieldset>`).join('')}
      <div class="quiz-foot"><button class="btn" type="button" id="q-ok">Corregir</button><span class="quiz-nota" id="q-nota" aria-live="polite"></span></div>`;
    sec.querySelector('#q-ok').addEventListener('click', corregir);
  }

  function corregir() {
    const fs = [...sec.querySelectorAll('.q')];
    const sinResponder = fs.filter(f => !f.querySelector('input:checked'));
    if (sinResponder.length) {
      sec.querySelector('#q-nota').textContent = 'Te faltan ' + sinResponder.length + ' pregunta(s) por responder.';
      sinResponder[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    let bien = 0;
    fs.forEach((f, i) => {
      const elegida = +f.querySelector('input:checked').value;
      const ok = orden[i][elegida].ok;
      if (ok) bien++;
      f.classList.add(ok ? 'ok' : 'mal');
      f.querySelectorAll('label').forEach((l, j) => { if (orden[i][j].ok) l.classList.add('bien'); else if (j === elegida) l.classList.add('fallo'); });
      f.querySelectorAll('input').forEach(x => { x.disabled = true; });
      const p = document.createElement('p'); p.className = 'exp'; p.textContent = PREGUNTAS[i].e; f.appendChild(p);
    });
    const nota = Math.round(bien / PREGUNTAS.length * 100) / 10;
    sec.querySelector('#q-nota').textContent = bien + ' de ' + PREGUNTAS.length + ' · nota ' + String(nota).replace('.', ',');
    const b = sec.querySelector('#q-ok');
    b.textContent = 'Repetir el test';
    b.removeEventListener('click', corregir);
    b.addEventListener('click', () => { pintar(); sec.scrollIntoView({ behavior: 'smooth' }); });
    if (globalThis.Seguimiento) Seguimiento.resultado({ reto: 'test', nota, detalle: bien + '/' + PREGUNTAS.length + ' aciertos' });
  }

  pintar();
})();
