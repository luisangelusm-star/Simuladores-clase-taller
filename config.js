/* =====================================================================
   CONFIGURACIÓN · lo único que tienes que tocar para ponerla en marcha
   ===================================================================== */
self.CONFIG = {
  // URL de la aplicación web de Google Apps Script (termina en /exec).
  // Mientras esté vacía, la app funciona en MODO PRUEBA: deja entrar con
  // cualquier usuario y no guarda nada.
  API_URL: '',

  NOMBRE_APP: 'Simuladores de taller',
  CENTRO: 'Departamento de Automoción',

  // Aviso que ven los alumnos al entrar.
  AVISO: 'Al entrar, se registran tu tiempo de uso, tus intentos y tus puntuaciones en los simuladores. Esos datos se usan para evaluar el trabajo autónomo.',

  // Segundos sin tocar ratón, teclado ni pantalla a partir de los cuales
  // deja de contar el «tiempo activo» (el tiempo en pantalla sigue contando).
  INACTIVIDAD_SEG: 90,

  // Cada cuántos segundos se envía el tiempo acumulado al servidor.
  LATIDO_SEG: 120,
};
