// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fila_de_informe_dto_resultado.dart';

part 'fila_de_informe_dto.g.dart';

@JsonSerializable()
class FilaDeInformeDto {
  const FilaDeInformeDto({
    required this.momento,
    required this.titular,
    required this.vivienda,
    required this.dispositivo,
    required this.metodo,
    required this.resultado,
    required this.detalle,
  });
  
  factory FilaDeInformeDto.fromJson(Map<String, Object?> json) => _$FilaDeInformeDtoFromJson(json);
  
  final DateTime momento;
  final String titular;
  final String vivienda;
  final String dispositivo;

  /// Placa, rostro, tarjeta… (columna MÉTODO del mockup)
  final String metodo;
  final FilaDeInformeDtoResultado resultado;
  final String detalle;

  Map<String, Object?> toJson() => _$FilaDeInformeDtoToJson(this);
}
