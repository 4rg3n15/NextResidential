import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/sesion.dart';

/// La política de sesión, en los seis casos que importan.
///
/// Son los que un token de 5 minutos produce de verdad en un teléfono, y todos
/// se comprueban en microsegundos porque el instante es un parámetro. Con
/// `DateTime.now()` dentro de la política, la mitad de estas pruebas exigiría
/// esperar.
void main() {
  Sesion sesionQueExpira(DateTime cuando) => Sesion(
        tokenDeAcceso: 'a',
        tokenDeRefresco: 'r',
        expiraEn: cuando,
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: 'residente@ejemplo.invalid',
      );

  final ahora = DateTime.utc(2026, 9, 18, 12, 0, 0);

  test('sin sesión, se piden credenciales', () {
    expect(accionPara(null, ahora), AccionDeSesion.pedirAcceso);
  });

  test('con cuatro minutos por delante, se sirve tal cual', () {
    final s = sesionQueExpira(ahora.add(const Duration(minutes: 4)));
    expect(accionPara(s, ahora, ultimoUso: ahora), AccionDeSesion.servir);
  });

  test('dentro del margen de un minuto, se renueva ANTES de usarla', () {
    // El caso que evita el 401: quedan 30 s, la petición tardaría en volar y el
    // reloj del teléfono puede ir adelantado. Se renueva.
    final s = sesionQueExpira(ahora.add(const Duration(seconds: 30)));
    expect(accionPara(s, ahora, ultimoUso: ahora), AccionDeSesion.renovar);
  });

  test('exactamente en el límite del margen, se renueva (no se sirve)', () {
    // El borde. Servir aquí dejaría salir una petición con 60 s de vida, que es
    // justo lo que el margen declara insuficiente.
    final s = sesionQueExpira(ahora.add(margenDeRefresco));
    expect(accionPara(s, ahora, ultimoUso: ahora), AccionDeSesion.renovar);
  });

  test('ya expirada tras una suspensión de horas, se renueva', () {
    // La app estuvo suspendida toda la tarde. Esto es lo que la hacía caer con
    // el refresco perezoso: la primera petición salía con este token.
    final s = sesionQueExpira(ahora.subtract(const Duration(hours: 6)));
    expect(
      accionPara(s, ahora, ultimoUso: ahora.subtract(const Duration(hours: 6))),
      AccionDeSesion.renovar,
    );
  });

  test('con el refresco fuera de su vida útil, se piden credenciales', () {
    // 31 días sin abrir la app. Intentar renovar daría un error técnico; pedir
    // acceso es lo que el residente puede resolver.
    final s = sesionQueExpira(ahora.subtract(const Duration(days: 31)));
    expect(
      accionPara(s, ahora, ultimoUso: ahora.subtract(const Duration(days: 31))),
      AccionDeSesion.pedirAcceso,
    );
  });

  test('debeRenovarAlVolver responde con la MISMA política, no con otra', () {
    // Dos caminos de decisión serían dos comportamientos, y el que no se prueba
    // es el que falla. Aquí se comprueba que coinciden en los tres casos.
    final porExpirar = sesionQueExpira(ahora.add(const Duration(seconds: 10)));
    final vigente = sesionQueExpira(ahora.add(const Duration(minutes: 4)));

    expect(debeRenovarAlVolver(porExpirar, ahora, ultimoUso: ahora), isTrue);
    expect(debeRenovarAlVolver(vigente, ahora, ultimoUso: ahora), isFalse);
    expect(debeRenovarAlVolver(null, ahora), isFalse);
  });

  test('conTokens conserva la identidad y cambia solo los tokens', () {
    final s = sesionQueExpira(ahora);
    final nueva = s.conTokens(
      tokenDeAcceso: 'a2',
      tokenDeRefresco: 'r2',
      expiraEn: ahora.add(const Duration(minutes: 5)),
    );
    expect(nueva.usuarioId, s.usuarioId);
    expect(nueva.copropiedadId, s.copropiedadId);
    expect(nueva.correo, s.correo);
    expect(nueva.tokenDeAcceso, 'a2');
  });
}
