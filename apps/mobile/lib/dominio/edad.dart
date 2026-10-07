/// La edad y la mayoría de edad (RONDA 15-W) · COPIA DE CORTESÍA.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUIÉN DECIDE
///
/// Sólo los mayores de 18 años tienen cuenta; los menores son residentes SIN
/// cuenta que registra un adulto de su hogar. Lo decide el SERVIDOR, con su
/// reloj y el día civil de Bogotá (`packages/domain-core/src/residente/edad.ts`,
/// y la base lo repite). Esto es la misma aritmética, para que el formulario
/// avise antes del viaje —y, en el primer ingreso, antes de que el servidor
/// BLOQUEE una cuenta por una fecha mal tecleada—.
///
/// El día que cuenta es el de BOGOTÁ: a las 20:00 del día anterior a un
/// cumpleaños, en UTC ya es el cumpleaños. Colombia no cambia la hora, así que
/// el desfase fijo de cinco horas es el del calendario de la zona. Quien nació
/// un 29 de febrero cumple el 1 de marzo en los años no bisiestos, como en el
/// servidor.
///
/// Los avisos de los formularios llevan UN DÍA DE MARGEN a favor de quien
/// escribe: el reloj del teléfono puede ir desfasado, y en el día exacto del
/// cumpleaños la regla del teléfono no puede contradecir a la del servidor. Lo
/// dudoso viaja, y el servidor contesta con su propio mensaje.
/// ═════════════════════════════════════════════════════════════════════════════
library;

const mayoriaDeEdad = 18;

/// Lo que lee quien intenta abrir una cuenta siendo menor (el mismo texto que
/// el del servidor).
const mensajeCuentaDeMenor =
    'Las cuentas son para mayores de edad. Un adulto de su hogar lo registra desde Mi familia';

/// Lo que lee el adulto que intenta registrar como menor a un mayor de edad.
const mensajeMayorSinCuenta =
    'Una persona mayor de edad crea su propia cuenta con un código de plaza';

/// Bogotá: UTC−5 todo el año.
const _desfaseDeBogota = Duration(hours: -5);

/// El margen de los avisos de cortesía (ver arriba).
const _margen = Duration(days: 1);

String _dos(int n) => n.toString().padLeft(2, '0');

/// El día civil de Bogotá en ese instante, como `AAAA-MM-DD`.
String diaCivilEnBogota(DateTime ahora) {
  final b = ahora.toUtc().add(_desfaseDeBogota);
  return '${b.year.toString().padLeft(4, '0')}-${_dos(b.month)}-${_dos(b.day)}';
}

(int, int, int) _numeros(String fecha) {
  final p = fecha.split('-').map(int.parse).toList();
  return (p[0], p[1], p[2]);
}

/// `AAAA-MM-DD` que existe en el calendario y no es anterior a 1900.
bool esFechaCivil(String valor) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(valor) || valor.compareTo('1900-01-01') < 0) {
    return false;
  }
  final (anio, mes, dia) = _numeros(valor);
  final f = DateTime.utc(anio, mes, dia);
  return f.year == anio && f.month == mes && f.day == dia;
}

/// Años cumplidos en el día de Bogotá de `ahora`. `null` si la fecha no es una
/// fecha civil o es posterior a hoy: nunca se trata como «mayor».
int? edadEn(String fechaNacimiento, DateTime ahora) {
  if (!esFechaCivil(fechaNacimiento)) return null;
  final hoy = diaCivilEnBogota(ahora);
  if (fechaNacimiento.compareTo(hoy) > 0) return null;
  final (anio, mes, dia) = _numeros(fechaNacimiento);
  final (anioHoy, mesHoy, diaHoy) = _numeros(hoy);
  final yaCumplio = mesHoy > mes || (mesHoy == mes && diaHoy >= dia);
  return anioHoy - anio - (yaCumplio ? 0 : 1);
}

bool puedeTenerCuenta(int edad) => edad >= mayoriaDeEdad;

String? _motivoDeForma(String fecha, String vacia) {
  if (fecha.isEmpty) return vacia;
  if (!esFechaCivil(fecha)) return 'Escriba la fecha como AAAA-MM-DD';
  return null;
}

/// Cortesía de «Crear cuenta» y del primer ingreso. `null` si puede viajar.
String? motivoDeFechaDeAdulto(String bruto, DateTime ahora) {
  final fecha = bruto.trim();
  final forma = _motivoDeForma(fecha, 'Escriba su fecha de nacimiento');
  if (forma != null) return forma;
  final edad = edadEn(fecha, ahora.add(_margen));
  if (edad == null) return 'Esa fecha todavía no llegó';
  return puedeTenerCuenta(edad) ? null : mensajeCuentaDeMenor;
}

/// Cortesía del formulario de un menor del hogar. `null` si puede viajar.
String? motivoDeFechaDeMenor(String bruto, DateTime ahora) {
  final fecha = bruto.trim();
  final forma = _motivoDeForma(fecha, 'Escriba la fecha de nacimiento');
  if (forma != null) return forma;
  if (edadEn(fecha, ahora.add(_margen)) == null) return 'Esa fecha todavía no llegó';
  // Nacido hoy con el reloj adelantado: aún no tiene edad, y es un menor.
  final edad = edadEn(fecha, ahora.subtract(_margen)) ?? 0;
  return puedeTenerCuenta(edad) ? mensajeMayorSinCuenta : null;
}
