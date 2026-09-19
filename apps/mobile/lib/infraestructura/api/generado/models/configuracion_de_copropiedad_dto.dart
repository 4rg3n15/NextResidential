// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'configuracion_de_copropiedad_dto_politica_contingencia_edge.dart';
import 'configuracion_de_copropiedad_dto_tipo.dart';

part 'configuracion_de_copropiedad_dto.g.dart';

@JsonSerializable()
class ConfiguracionDeCopropiedadDto {
  const ConfiguracionDeCopropiedadDto({
    required this.nombre,
    required this.direccion,
    required this.tipo,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
    required this.zonaHoraria,
    required this.umbralConfianzaPlaca,
    required this.politicaContingenciaEdge,
    required this.umbralLatidoMinutos,
    required this.nit,
    required this.estado,
    required this.plazoConsentimientoHoras,
    required this.margenCacheReglasHoras,
    required this.versionReglasActual,
    required this.editables,
  });
  
  factory ConfiguracionDeCopropiedadDto.fromJson(Map<String, Object?> json) => _$ConfiguracionDeCopropiedadDtoFromJson(json);
  
  final String nombre;

  /// Dirección DEL CONJUNTO. La vivienda no tiene la suya: en Colombia la dirección es de la copropiedad y lo que cambia es la agrupación y el número.
  final String? direccion;

  /// null = SIN CONFIGURAR, y es lo que dispara el diálogo inicial de la consola. Decide el formulario de alta y las etiquetas sugeridas; ninguna vivienda lo guarda, así que cambiarlo no afecta a las ya creadas.
  final ConfiguracionDeCopropiedadDtoTipo? tipo;

  /// Cómo se llama una vivienda aquí. Es una ETIQUETA: se pinta al mostrar y nunca entra en el identificador, por eso cambiarla no renombra ninguna fila.
  final String etiquetaVivienda;

  /// Cómo se llama la agrupación aquí.
  final String etiquetaAgrupacion;
  final String zonaHoraria;

  /// Por debajo de este valor la lectura de placa NO decide sola: escala al portero (CU-01, excepción 3a). Sólo el superadministrador lo cambia.
  final num umbralConfianzaPlaca;

  /// Respuesta del Edge cuando la regla no está en su caché (RN-16). «denegar» es el valor conservador que impone §2.1.4.
  final ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge politicaContingenciaEdge;
  final num umbralLatidoMinutos;

  /// Solo lectura: identidad fiscal, con índice único.
  final String nit;

  /// Solo lectura: suspender un tenant no es configurar.
  final String estado;

  /// Solo lectura: cota legal de la Ley 1581 de 2012, no valor por defecto.
  final num plazoConsentimientoHoras;

  /// Solo lectura: sostiene el marcado de decisión con caché obsoleto (KPI-31).
  final num margenCacheReglasHoras;
  final num versionReglasActual;

  /// Ajustes que ESTE rol puede cambiar. La consola deshabilita el resto.
  final List<String> editables;

  Map<String, Object?> toJson() => _$ConfiguracionDeCopropiedadDtoToJson(this);
}
