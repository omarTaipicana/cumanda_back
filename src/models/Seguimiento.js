// models/Seguimiento.js
const { DataTypes } = require("sequelize");
const sequelize = require("../utils/connection");

const Seguimiento = sequelize.define("seguimiento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  inscripcionId: {
    type: DataTypes.UUID,
    allowNull: false,
  },

  usuarioEdicion: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  resultado: {
    type: DataTypes.ENUM(
      "sin_respuesta",
      "numero_incorrecto",
      "interesado",
      "no_interesado",
      "volver_llamar",
      "pago_pendiente"
    ),
    allowNull: false,
  },

  observacion: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  proximoContacto: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

module.exports = Seguimiento;