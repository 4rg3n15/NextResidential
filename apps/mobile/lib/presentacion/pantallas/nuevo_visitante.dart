/// M-4 · F1 · Nuevo visitante: quién, cuándo, cuánto, su foto y la casilla.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// ES LA PANTALLA QUE MÁS ESCRIBE, Y ESO CAMBIA TODO
///
/// Las otras leen: si algo sale mal, se reintenta y no ha pasado nada. Aquí un
/// fallo mal resuelto deja al residente sin saber si su visitante podrá entrar,
/// o —peor— crea la visita dos veces y el portero ve dos autorizaciones para la
/// misma persona sin saber cuál vale.
///
/// De ahí las decisiones que gobiernan el fichero:
///
/// 1. **La clave de idempotencia se genera al ABRIR el formulario**, no al
///    pulsar. Si se generara al pulsar, el segundo toque del botón —o el
///    reintento tras un fallo de red— llevaría una clave distinta y el servidor
///    crearía una segunda visita. Se genera una vez y sobrevive a los
///    reintentos (RN-17).
/// 2. **La foto y la casilla son parte de la visita**, no un paso posterior. La
///    visita nace autorizada y su foto sale a los equipos en el mismo envío:
///    no hay enlace para el visitante ni nada que esperar. Por eso el botón no
///    se habilita hasta que hay nombre, documento, una foto que sirve y la
///    casilla marcada — y debajo se dice qué falta.
/// 3. **El rechazo NO es un error.** Llega como respuesta con su motivo tipado
///    —de negocio o de la foto— y se pinta como lo que es: una explicación y
///    una salida.
/// 4. **Si no hay red, la visita NO se pierde.** Va a la bandeja de salida con
///    su clave, su foto y su casilla, y la pantalla lo dice sin prometer lo que
///    no puede: «quedó pendiente de enviarse», no «autorizada».
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE NO SE VALIDA AQUÍ
///
/// Las reglas de negocio —lista negra, vivienda inactiva, placa duplicada— y
/// la vigencia. Eso es del dominio del servidor, y duplicarlo aquí crearía dos
/// verdades que se separan a la tercera corrección. Aquí se valida **forma**:
/// longitudes, que haya foto, que la casilla esté marcada. Es la misma frontera
/// que en la API entre el DTO y el agregado (§2.7.3), leída desde el cliente.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';
import '../widgets/campos_de_visita.dart';
import '../widgets/foto_del_visitante.dart';

/// Qué hacer con la visita compuesta. La pantalla no sabe si irá por red o a la
/// bandeja: eso lo decide quien la monta, y por eso esto es una función.
typedef EnviarVisita = Future<ResultadoDeEnvio> Function(NuevaVisita visita);

/// Los dos desenlaces que llegan hasta la pantalla: el conjunto contestó, o la
/// visita se quedó esperando en la bandeja.
sealed class ResultadoDeEnvio {
  const ResultadoDeEnvio();
}

/// El conjunto contestó: creada, repetida, rechazada o con la foto rechazada.
class EnvioResuelto extends ResultadoDeEnvio {
  const EnvioResuelto(this.resultado);
  final ResultadoDeVisita resultado;
}

/// Sin red. La visita quedó guardada con su clave y se reintentará sola.
class EnvioEncolado extends ResultadoDeEnvio {
  const EnvioEncolado();
}

class PantallaDeNuevoVisitante extends StatefulWidget {
  const PantallaDeNuevoVisitante({
    super.key,
    required this.enviar,
    required this.tomarFoto,
    required this.claveDeIdempotencia,
    required this.ahora,
  });

  final EnviarVisita enviar;
  final TomarFoto tomarFoto;

  /// **Se recibe ya generada, y ese es el punto.** El widget no la fabrica en
  /// su `initState` porque un `setState` que lo reconstruyera la cambiaría; y
  /// una clave que cambia deja de ser una clave de idempotencia.
  final String claveDeIdempotencia;

  /// El instante con que se precarga la fecha y la hora. Llega del reloj de la
  /// app, no de `DateTime.now()`, para que la prueba lo pueda fijar.
  final DateTime ahora;

  @override
  State<PantallaDeNuevoVisitante> createState() => _PantallaDeNuevoVisitanteState();
}

class _PantallaDeNuevoVisitanteState extends State<PantallaDeNuevoVisitante> {
  final _formulario = GlobalKey<FormState>();
  final _visitante = TextEditingController();
  final _documento = TextEditingController();
  final _placa = TextEditingController();
  final _observaciones = TextEditingController();

  late DateTime _inicio = alMinuto(widget.ahora);
  int _duracion = duracionPorOmision;
  FotoDeVisita? _foto;
  bool _casilla = false;

  bool _enviando = false;
  ResultadoDeEnvio? _desenlace;
  String? _error;

  @override
  void dispose() {
    for (final c in [_visitante, _documento, _placa, _observaciones]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Lo que todavía falta, dicho en palabras. Es lo que se lee bajo el botón
  /// deshabilitado: un botón gris sin explicación parece una app rota.
  List<String> get _faltantes => [
        if (_visitante.text.trim().length < 3) 'el nombre',
        if (_documento.text.trim().length < 4) 'el documento',
        if (_foto == null) 'una foto que sirva',
        if (!_casilla) 'marcar la casilla',
      ];

  /// Mayúsculas y sin espacios ni guiones: así la guarda el servidor, y así se
  /// cuenta el tope de ocho caracteres que admite.
  String? get _placaNormalizada {
    final p = _placa.text.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
    return p.isEmpty ? null : p;
  }

  Future<void> _enviar() async {
    final foto = _foto;
    if (_faltantes.isNotEmpty || foto == null || _enviando) return;
    if (!(_formulario.currentState?.validate() ?? false)) return;

    setState(() {
      _enviando = true;
      _desenlace = null;
      _error = null;
    });
    try {
      final r = await widget.enviar(
        NuevaVisita(
          visitante: _visitante.text.trim(),
          documento: _documento.text.trim(),
          inicio: _inicio,
          duracionMinutos: _duracion,
          placa: _placaNormalizada,
          observaciones: _vacioANulo(_observaciones.text),
          foto: foto,
          casillaMarcada: _casilla,
          claveDeIdempotencia: widget.claveDeIdempotencia,
        ),
      );
      if (!mounted) return;
      setState(() => _desenlace = r);
    } on Fallo catch (f) {
      // Sin permiso, un formulario que el servidor no admite, la sesión
      // vencida: no se encola —reintentar daría lo mismo— y se dice por qué.
      if (mounted) setState(() => _error = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  static String? _vacioANulo(String s) => s.trim().isEmpty ? null : s.trim();

  void _repintar(String _) => setState(() {});

  @override
  Widget build(BuildContext context) {
    final faltan = _faltantes;
    final habilitado = !_enviando;
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo visitante')),
      body: Form(
        key: _formulario,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            // ── Quién viene ────────────────────────────────────────────────
            TextFormField(
              key: const Key('visita.nombre'),
              controller: _visitante,
              enabled: habilitado,
              decoration: const InputDecoration(
                labelText: 'Nombre del visitante',
                helperText: 'Como aparece en su documento',
              ),
              textCapitalization: TextCapitalization.words,
              inputFormatters: [LengthLimitingTextInputFormatter(120)],
              onChanged: _repintar,
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? 'Escriba el nombre del visitante' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('visita.documento'),
              controller: _documento,
              enabled: habilitado,
              decoration: const InputDecoration(
                labelText: 'Número de documento',
                // Se dice POR QUÉ se pide, en vez de pedirlo sin explicar.
                helperText: 'Con él, el conjunto comprueba que no esté en la lista negra',
              ),
              inputFormatters: [LengthLimitingTextInputFormatter(32)],
              onChanged: _repintar,
              validator: (v) => (v == null || v.trim().length < 4)
                  ? 'Escriba el documento (al menos 4 caracteres)'
                  : null,
            ),

            const SizedBox(height: 24),
            const _Titulo('¿Cuándo viene?'),
            CuandoYCuantoDura(
              inicio: _inicio,
              duracionMinutos: _duracion,
              hoy: widget.ahora.toLocal(),
              habilitado: habilitado,
              alCambiarInicio: (d) => setState(() => _inicio = d),
              alCambiarDuracion: (m) => setState(() => _duracion = m),
            ),

            const SizedBox(height: 24),
            const _Titulo('¿En vehículo?'),
            TextFormField(
              key: const Key('visita.placa'),
              controller: _placa,
              enabled: habilitado,
              decoration: const InputDecoration(
                labelText: 'Placa (opcional)',
                helperText: 'Se guarda en mayúsculas, sin espacios ni guiones',
              ),
              textCapitalization: TextCapitalization.characters,
              // [SUPUESTO] S-88: el tope de 8 es el del servidor.
              validator: (_) => (_placaNormalizada?.length ?? 0) > 8
                  ? 'Revise la placa: tiene más de 8 caracteres'
                  : null,
            ),

            const SizedBox(height: 16),
            TextFormField(
              key: const Key('visita.observaciones'),
              controller: _observaciones,
              enabled: habilitado,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(
                labelText: 'Observaciones para la portería (opcional)',
              ),
            ),

            const SizedBox(height: 16),
            FotoDelVisitante(
              tomarFoto: widget.tomarFoto,
              habilitada: habilitado,
              alCambiar: (f) => setState(() => _foto = f),
            ),

            const SizedBox(height: 16),
            CasillaDeLaFoto(
              marcada: _casilla,
              habilitada: habilitado,
              alCambiar: (v) => setState(() => _casilla = v),
            ),

            // El desenlace va junto al botón, que es donde está mirando quien
            // acaba de pulsarlo; arriba del todo quedaría fuera de la vista.
            if (_error != null) ...[
              const SizedBox(height: 16),
              AvisoDeVisitaFallida(
                detalle: _error!,
                alCerrar: () => setState(() => _error = null),
              ),
            ],
            if (_desenlace != null) ...[
              const SizedBox(height: 16),
              switch (_desenlace!) {
                EnvioResuelto(resultado: final r) => DesenlaceDeVisita(
                    resultado: r,
                    alCerrar: () => setState(() => _desenlace = null),
                  ),
                EnvioEncolado() => AvisoDeVisitaEncolada(
                    alCerrar: () => setState(() => _desenlace = null),
                  ),
              },
            ],

            const SizedBox(height: 16),
            FilledButton.icon(
              key: const Key('visita.registrar'),
              onPressed: faltan.isEmpty && !_enviando ? _enviar : null,
              icon: _enviando
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check),
              label: Text(_enviando ? 'Registrando…' : 'Registrar visita'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            ),
            if (faltan.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Falta: ${faltan.join(', ')}.',
                key: const Key('visita.faltantes'),
                style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(texto, style: Theme.of(context).textTheme.titleSmall),
      );
}
