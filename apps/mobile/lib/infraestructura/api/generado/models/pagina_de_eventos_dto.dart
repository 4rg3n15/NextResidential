// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'evento_registrado_dto.dart';

part 'pagina_de_eventos_dto.g.dart';

@JsonSerializable()
class PaginaDeEventosDto {
  const PaginaDeEventosDto({
    required this.filas,
    required this.siguiente,
  });
  
  factory PaginaDeEventosDto.fromJson(Map<String, Object?> json) => _$PaginaDeEventosDtoFromJson(json);
  
  final List<EventoRegistradoDto> filas;

  /// Cursor opaco de la siguiente página; null cuando no hay más
  final String? siguiente;

  Map<String, Object?> toJson() => _$PaginaDeEventosDtoToJson(this);
}
