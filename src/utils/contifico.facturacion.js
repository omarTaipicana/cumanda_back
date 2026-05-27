const Pagos = require("../models/Pagos"); // ajusta según tu estructura
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Course = require("../models/Course");

const {
  contificoGetSiguienteDocumento,
  contificoCrearFacturaIva0,
} = require("./contifico.service");

async function contificoEmitirFacturaPorPagoId(pagoId) {
  const pago = await Pagos.findByPk(pagoId, {
    include: [{ model: Inscripcion, include: [{ model: User }, { model: Course }] }],
  });

  if (!pago) throw new Error("Pago no encontrado");

  // ✅ anti-duplicado
  if (pago.contificoDocumentoId) {
    return {
      skipped: true,
      motivo: "Pago ya facturado",
      documento: pago.contificoDocumentoNumero,
    };
  }

  const user = pago.inscripcion?.user;
  const course = pago.inscripcion?.course;

  if (!user) throw new Error("Pago sin usuario");
  if (!user.contificoPersonaId)
    throw new Error("Usuario sin contificoPersonaId");

  const total = Number(pago.valorDepositado);

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`valorDepositado inválido: ${pago.valorDepositado}`);
  }

  // ✅ documento consecutivo según Contífico
  const { documento } = await contificoGetSiguienteDocumento();

  // ✅ crear factura
  const doc = await contificoCrearFacturaIva0({
    documento,
    personaId: user.contificoPersonaId,
    cedula: String(user.cI || "").trim(),
    email: String(user.email || "").trim(),
    razon_social: `${user.firstName} ${user.lastName}`.trim(),
    direccion: `${user.city || ""} ${user.province || ""}`.trim(),
    telefonos: user.cellular || "",
    total,
    descripcionItem: `Pago curso: ${
      course?.nombre || pago.curso || "Curso"
    }`,
  });

  // ✅ guardar vínculo en Pagos
  await Pagos.update(
    {
      contificoDocumentoId: doc.id,
      contificoDocumentoNumero: doc.documento,
      contificoEstado: doc.estado,
      contificoFirmado: doc.firmado,
      contificoAutorizacion: doc.autorizacion,
      contificoUrlRide: doc.url_ride,
      contificoUrlXml: doc.url_xml,
    },
    { where: { id: pagoId } }
  );

  return { skipped: false, doc };
}

module.exports = {
  contificoEmitirFacturaPorPagoId,
};
