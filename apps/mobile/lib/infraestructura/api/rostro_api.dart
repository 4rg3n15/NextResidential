/// «Mi rostro» y el de un menor de mi hogar contra la API (RONDA 15-X, D2 y D3,
/// ADR-039).
///
/// Ninguna ruta recibe la persona: el servidor la saca del vínculo de la
/// cuenta, y aquí no hay parámetro donde ponerla. Lo que vuelve es el ESTADO
/// —nunca la imagen—, y los rechazos llegan como `Fallo` con el texto del
/// servidor: la política que cambió (409), la foto que no sirve (400), el tope
/// de capturas del día (429, con su espera).
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/rostro.dart';
import '../../dominio/rostro_de_menor.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/equipo_del_rostro_dto.dart';
import 'generado/models/equipo_del_rostro_dto_estado.dart';
import 'generado/models/estado_de_mi_rostro_dto.dart';
import 'generado/models/medidas_de_foto_dto.dart';
import 'generado/models/mi_rostro_con_politica_dto.dart';
import 'generado/models/mi_rostro_dto.dart';
import 'generado/models/mi_rostro_dto_tipo_mime.dart';
import 'generado/models/rostro_de_menor_dto.dart';
import 'generado/models/rostro_de_menor_dto_tipo_mime.dart';
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
            medidas: medidasDe(foto),
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

/// D3 · el rostro de un menor de MI vivienda, por su `residenteId`. Al
/// registrar, el titular declara que es su representante legal y que el menor
/// está informado y de acuerdo: la pantalla no llama sin esas dos casillas.
class RostroDeMenoresPorApi implements RostroDeMenores {
  RostroDeMenoresPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  @override
  RostroDelResidente de(String residenteId) => _RostroDeUnMenor(_api, _sesion, residenteId);
}

class _RostroDeUnMenor implements RostroDelResidente {
  _RostroDeUnMenor(this._api, this._sesion, this._menor);

  final ResidenteApi _api;
  final SesionEnUso _sesion;
  final String _menor;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<EstadoDeMiRostro> miRostro() => pedirALaApi(() async {
    final d = await _api.rostroDeMisMenoresControllerEstado(id: _copropiedad, residenteId: _menor);
    return estadoConPoliticaDe(d);
  });

  @override
  Future<EstadoDeMiRostro> registrar(FotoDeRostro foto, {required String versionPolitica}) =>
      pedirALaApi(() async {
        final d = await _api.rostroDeMisMenoresControllerRegistrar(
          id: _copropiedad,
          residenteId: _menor,
          body: RostroDeMenorDto(
            contenidoBase64: foto.jpegBase64,
            tipoMime: RostroDeMenorDtoTipoMime.fromJson('image/jpeg'),
            medidas: medidasDe(foto),
            versionPolitica: versionPolitica,
            aceptaPolitica: true,
            declaraRepresentacionLegal: true,
            menorInformadoYDeAcuerdo: true,
          ),
        );
        return estadoDe(d);
      });

  @override
  Future<EstadoDeMiRostro> retirar() => pedirALaApi(() async {
    final d = await _api.rostroDeMisMenoresControllerRetirar(id: _copropiedad, residenteId: _menor);
    return estadoDe(d);
  });
}

MedidasDeFotoDto medidasDe(FotoDeRostro foto) => MedidasDeFotoDto(
  rostrosDetectados: foto.medidas.rostrosDetectados,
  nitidez: foto.medidas.nitidez,
  iluminacion: foto.medidas.iluminacion,
  proporcionRostro: foto.medidas.proporcionRostro,
);

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
