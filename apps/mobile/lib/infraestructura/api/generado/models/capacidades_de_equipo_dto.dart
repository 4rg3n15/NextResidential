// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capacidad_de_audio_dto.dart';
import 'capacidad_de_biblioteca_dto.dart';
import 'capacidades_de_equipo_dto_apertura_remota.dart';
import 'capacidades_de_equipo_dto_estado_de_barrera.dart';
import 'capacidades_de_equipo_dto_gestion_de_personas.dart';
import 'capacidades_de_equipo_dto_origen.dart';
import 'capacidades_de_equipo_dto_reconocimiento_de_placas.dart';
import 'capacidades_de_equipo_dto_senalizacion_de_llamada.dart';
import 'capacidades_de_equipo_dto_suscripcion_de_eventos.dart';
import 'capacidades_de_equipo_dto_verificacion_remota.dart';

part 'capacidades_de_equipo_dto.g.dart';

@JsonSerializable()
class CapacidadesDeEquipoDto {
  const CapacidadesDeEquipoDto({
    required this.origen,
    required this.aperturaRemota,
    required this.verificacionRemota,
    required this.bibliotecaDeRostros,
    required this.gestionDePersonas,
    required this.audioBidireccional,
    required this.senalizacionDeLlamada,
    required this.suscripcionDeEventos,
    required this.reconocimientoDePlacas,
    required this.estadoDeBarrera,
  });
  
  factory CapacidadesDeEquipoDto.fromJson(Map<String, Object?> json) => _$CapacidadesDeEquipoDtoFromJson(json);
  
  final CapacidadesDeEquipoDtoOrigen origen;
  final CapacidadesDeEquipoDtoAperturaRemota aperturaRemota;
  final CapacidadesDeEquipoDtoVerificacionRemota verificacionRemota;
  final CapacidadDeBibliotecaDto bibliotecaDeRostros;
  final CapacidadesDeEquipoDtoGestionDePersonas gestionDePersonas;
  final CapacidadDeAudioDto audioBidireccional;
  final CapacidadesDeEquipoDtoSenalizacionDeLlamada senalizacionDeLlamada;
  final CapacidadesDeEquipoDtoSuscripcionDeEventos suscripcionDeEventos;
  final CapacidadesDeEquipoDtoReconocimientoDePlacas reconocimientoDePlacas;
  final CapacidadesDeEquipoDtoEstadoDeBarrera estadoDeBarrera;

  Map<String, Object?> toJson() => _$CapacidadesDeEquipoDtoToJson(this);
}
