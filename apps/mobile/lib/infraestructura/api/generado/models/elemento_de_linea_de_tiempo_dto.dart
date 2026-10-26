// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'codigo_del_equipo_dto.dart';
import 'elemento_de_linea_de_tiempo_dto_clase_persona.dart';
import 'elemento_de_linea_de_tiempo_dto_origen.dart';
import 'elemento_de_linea_de_tiempo_dto_resultado.dart';

part 'elemento_de_linea_de_tiempo_dto.g.dart';

@JsonSerializable()
class ElementoDeLineaDeTiempoDto {
  const ElementoDeLineaDeTiempoDto({
    required this.origen,
    required this.id,
    required this.ocurridoEn,
    required this.dispositivoId,
    required this.tipo,
    required this.titulo,
    required this.resultado,
    required this.enVivo,
    required this.eventoId,
    required this.codigo,
    required this.horaDelEquipo,
    required this.relojDesviadoSegundos,
    required this.metodo,
    required this.motivo,
    required this.placa,
    required this.personaId,
    required this.persona,
    required this.clasePersona,
    required this.viviendaId,
    required this.vivienda,
    required this.operadorId,
    required this.operador,
  });
  
  factory ElementoDeLineaDeTiempoDto.fromJson(Map<String, Object?> json) => _$ElementoDeLineaDeTiempoDtoFromJson(json);
  
  final ElementoDeLineaDeTiempoDtoOrigen origen;
  final String id;
  final DateTime ocurridoEn;
  final String dispositivoId;

  /// `acceso` o el tipo normalizado del evento de equipo
  final String tipo;

  /// Lo que la consola enseña, en español
  final String titulo;
  final ElementoDeLineaDeTiempoDtoResultado? resultado;

  /// `false` para lo que el equipo declaró histórico
  final bool enVivo;
  final String? eventoId;
  final CodigoDelEquipoDto? codigo;

  /// R2 (15-N) · con el reloj del equipo desviado, la hora que DIJO el equipo; `ocurridoEn` es entonces la de recepción de la plataforma
  final DateTime? horaDelEquipo;

  /// Segundos que el reloj del equipo iba por delante (negativo: atrasado)
  final num? relojDesviadoSegundos;

  /// placa, facial, tarjeta, manual, remoto
  final String? metodo;
  final String? motivo;
  final String? placa;

  /// Nulo en un acceso: «Desconocido»
  final String? personaId;
  final String? persona;
  final ElementoDeLineaDeTiempoDtoClasePersona? clasePersona;
  final String? viviendaId;
  final String? vivienda;

  /// Quién abrió o negó a mano
  final String? operadorId;
  final String? operador;

  Map<String, Object?> toJson() => _$ElementoDeLineaDeTiempoDtoToJson(this);
}
