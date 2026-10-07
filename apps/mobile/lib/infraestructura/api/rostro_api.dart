/// «Mi rostro» contra la API (RONDA 15-X, D2, ADR-039).
///
/// Ninguna ruta recibe la persona: el servidor la saca del vínculo de la
/// cuenta, y aquí no hay parámetro donde ponerla. Lo que vuelve es el ESTADO
/// —nunca la imagen—, y los rechazos llegan como `Fallo` con el texto del
/// servidor: la política que cambió (409), la foto que no sirve (400), el tope
/// de capturas del día (429, con su espera).
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/rostro.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/equipo_del_rostro_dto.dart';
import 'generado/models/equipo_del_rostro_dto_estado.dart';
import 'generado/models/estado_de_mi_rostro_dto.dart';
import 'generado/models/medidas_de_foto_dto.dart';
import 'generado/models/mi_rostro_con_politica_dto.dart';
import 'generado/models/mi_rostro_dto.dart';
import 'generado/models/mi_rostro_dto_tipo_mime.dart';
import 'soporte_de_api.dart';

class RostroPorApi implements RostroDelResidente {
  RostroPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<EstadoDeMiRostro> miRostro() => pedirALaApi(() async {
    final d = await _api.miRostroControllerEstado(id: _copropiedad);
    return estadoConPoliticaDe(d);
  });

  @override
  Future<EstadoDeMiRostro> registrar(FotoDeRostro foto, {required String versionPolitica}) =>
      pedirALaApi(() async {
        final d = await _api.miRostroControllerRegistrar(
          id: _copropiedad,
          body: MiRostroDto(
            contenidoBase64: foto.jpegBase64,
            // Siempre JPEG: es lo que produce la cámara del teléfono, y el
            // servidor comprueba que el contenido sea lo que dice el tipo.
            tipoMime: MiRostroDtoTipoMime.fromJson('image/jpeg'),
            medidas: MedidasDeFotoDto(
              rostrosDetectados: foto.medidas.rostrosDetectados,
              nitidez: foto.medidas.nitidez,
              iluminacion: foto.medidas.iluminacion,
              proporcionRostro: foto.medidas.proporcionRostro,
            ),
            versionPolitica: versionPolitica,
            aceptaPolitica: true,
          ),
        );
        return estadoDe(d);
      });

  @override
  Future<EstadoDeMiRostro> retirar() => pedirALaApi(() async {
    final d = await _api.miRostroControllerRetirar(id: _copropiedad);
    return estadoDe(d);
  });
}

EstadoDeMiRostro estadoDe(EstadoDeMiRostroDto d) => EstadoDeMiRostro(
  estado: EstadoDelRostro.de(d.estado.json ?? ''),
  calidad: d.calidad?.toDouble(),
  registradoEn: d.registradoEn,
  venceEn: d.venceEn,
  diasParaVencer: d.diasParaVencer?.toInt(),
  equiposConRostro: d.equiposConRostro.toInt(),
  equiposConMiRostro: d.equiposConMiRostro.toInt(),
  equipos: d.equipos.map(_equipoDe).toList(growable: false),
);

EstadoDeMiRostro estadoConPoliticaDe(MiRostroConPoliticaDto d) => EstadoDeMiRostro(
  estado: EstadoDelRostro.de(d.estado.json ?? ''),
  calidad: d.calidad?.toDouble(),
  registradoEn: d.registradoEn,
  venceEn: d.venceEn,
  diasParaVencer: d.diasParaVencer?.toInt(),
  equiposConRostro: d.equiposConRostro.toInt(),
  equiposConMiRostro: d.equiposConMiRostro.toInt(),
  equipos: d.equipos.map(_equipoDe).toList(growable: false),
  politica: PoliticaDelRostro(version: d.politica.version, texto: d.politica.texto),
);

/// Un estado de equipo que el servidor añada mañana es «pendiente»: nunca
/// «lo reconoce», que prometería algo que nadie comprobó.
EquipoDelRostro _equipoDe(EquipoDelRostroDto e) => EquipoDelRostro(
  nombre: e.nombre,
  estado: switch (e.estado) {
    EquipoDelRostroDtoEstado.sincronizada => EstadoEnEquipo.sincronizada,
    EquipoDelRostroDtoEstado.fallida => EstadoEnEquipo.fallida,
    _ => EstadoEnEquipo.pendiente,
  },
);
