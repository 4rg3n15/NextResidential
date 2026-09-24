// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capacidades_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapacidadesDeEquipoDto _$CapacidadesDeEquipoDtoFromJson(
  Map<String, dynamic> json,
) => CapacidadesDeEquipoDto(
  origen: CapacidadesDeEquipoDtoOrigen.fromJson(json['origen'] as String),
  aperturaRemota: CapacidadesDeEquipoDtoAperturaRemota.fromJson(
    json['aperturaRemota'] as String,
  ),
  verificacionRemota: CapacidadesDeEquipoDtoVerificacionRemota.fromJson(
    json['verificacionRemota'] as String,
  ),
  bibliotecaDeRostros: CapacidadDeBibliotecaDto.fromJson(
    json['bibliotecaDeRostros'] as Map<String, dynamic>,
  ),
  gestionDePersonas: CapacidadesDeEquipoDtoGestionDePersonas.fromJson(
    json['gestionDePersonas'] as String,
  ),
  audioBidireccional: CapacidadDeAudioDto.fromJson(
    json['audioBidireccional'] as Map<String, dynamic>,
  ),
  senalizacionDeLlamada: CapacidadesDeEquipoDtoSenalizacionDeLlamada.fromJson(
    json['senalizacionDeLlamada'] as String,
  ),
  suscripcionDeEventos: CapacidadesDeEquipoDtoSuscripcionDeEventos.fromJson(
    json['suscripcionDeEventos'] as String,
  ),
  reconocimientoDePlacas: CapacidadesDeEquipoDtoReconocimientoDePlacas.fromJson(
    json['reconocimientoDePlacas'] as String,
  ),
  estadoDeBarrera: CapacidadesDeEquipoDtoEstadoDeBarrera.fromJson(
    json['estadoDeBarrera'] as String,
  ),
);

Map<String, dynamic> _$CapacidadesDeEquipoDtoToJson(
  CapacidadesDeEquipoDto instance,
) => <String, dynamic>{
  'origen': instance.origen,
  'aperturaRemota': instance.aperturaRemota,
  'verificacionRemota': instance.verificacionRemota,
  'bibliotecaDeRostros': instance.bibliotecaDeRostros,
  'gestionDePersonas': instance.gestionDePersonas,
  'audioBidireccional': instance.audioBidireccional,
  'senalizacionDeLlamada': instance.senalizacionDeLlamada,
  'suscripcionDeEventos': instance.suscripcionDeEventos,
  'reconocimientoDePlacas': instance.reconocimientoDePlacas,
  'estadoDeBarrera': instance.estadoDeBarrera,
};
