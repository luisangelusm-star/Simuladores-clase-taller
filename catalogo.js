/* =====================================================================
   CATÁLOGO DE SIMULADORES
   Para añadir uno: crea su carpeta dentro de «sims/», copia la entrada de
   ejemplo y cambia los datos. «archivos» son los ficheros que la app guarda
   para funcionar sin conexión. «grupos» (opcional) limita quién lo ve:
   escribe los grupos tal cual aparecen en la hoja de Alumnos.
   ===================================================================== */
self.CATALOGO = [
  {
    id: 'jtd',
    titulo: 'Banco eléctrico 1.9 JTD',
    modulo: 'Sistemas auxiliares del motor',
    descripcion: 'Esquema eléctrico del common rail EDC16 con polímetro, osciloscopio y diagnosis. Localiza la avería y repárala.',
    ruta: 'sims/jtd/',
    archivos: ['index.html', 'solver.js', 'model.js', 'faults.js', 'sim.js', 'schematic.js', 'tools.js', 'app.js'],
    icono: 'esquema',
    puntua: 'Cada avería resuelta: 10 puntos menos 2 por cada reparación fallida.',
    // grupos: ['2º EVA'],
  },
  {
    id: 'osciloscopio',
    titulo: 'Osciloscopio de taller',
    modulo: 'Sensores y actuadores',
    descripcion: 'Mide sensores y actuadores del motor con un osciloscopio de dos canales. Ajusta escalas y disparo hasta ver la señal bien.',
    ruta: 'sims/osciloscopio/',
    archivos: ['index.html', 'retos.js'],
    icono: 'onda',
    puntua: 'Cada componente bien ajustado: 10 puntos (5 si has usado Autoset).',
  },
  {
    id: 'can',
    titulo: 'Tensión diferencial CAN',
    modulo: 'Redes multiplexadas',
    descripcion: 'CAN-H, CAN-L y su diferencia en el osciloscopio, con arranque e interferencias. Al final, un test de comprobación.',
    ruta: 'sims/can/',
    archivos: ['index.html', 'test.js'],
    icono: 'can',
    puntua: 'Test final de 6 preguntas, nota sobre 10.',
  },
];
