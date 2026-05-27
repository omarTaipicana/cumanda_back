// src/jobs/contifico.cron.js
const cron = require("node-cron");
const { Op } = require("sequelize");

const Pagos = require("../models/Pagos");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Course = require("../models/Course");

const ProgramaPagos = require("../models/ProgramaPagos");
const ProgramaInscripciones = require("../models/ProgramaInscripciones");
const ProgramasSuperiores = require("../models/ProgramasSuperiores");

const sendEmail = require("../utils/sendEmail");
const { contificoGetDocumentoById } = require("../utils/contifico.service");

let running = false;

const startContificoCron = () => {
  cron.schedule("*/2 * * * *", async () => {
    if (running) return;
    running = true;

    try {
      /* =========================
         PAGOS CURSOS
      ========================= */
      const pendientesCursos = await Pagos.findAll({
        where: {
          contificoDocumentoId: { [Op.ne]: null },
          contificoAutorizacion: null,
          contificoEmailEnviado: false,
        },
        order: [["updatedAt", "ASC"]],
        limit: 20,
      });

      for (const pago of pendientesCursos) {
        try {
          const doc = await contificoGetDocumentoById(pago.contificoDocumentoId);

          await Pagos.update(
            {
              contificoEstado: doc.estado,
              contificoAutorizacion: doc.autorizacion,
              contificoUrlRide: doc.url_ride,
              contificoUrlXml: doc.url_xml,
              contificoFirmado: doc.firmado,
            },
            { where: { id: pago.id } }
          );

          if (!doc.autorizacion) continue;

          const pagoFresh = await Pagos.findByPk(pago.id);
          if (!pagoFresh || pagoFresh.contificoEmailEnviado) continue;

          const ins = await Inscripcion.findByPk(pagoFresh.inscripcionId, {
            include: [{ model: User }, { model: Course }],
          });

          const user = ins?.user;
          const course = ins?.course;

          if (!user?.email) continue;

          await sendEmail({
            to: user.email,
            subject: `📄 Factura autorizada SRI - EDUKA (${doc.documento})`,
            html: `
<div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
    <div style="text-align:center; background-color:#1B326B; padding:20px;">
      <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width:150px;" />
    </div>

    <div style="padding:30px; text-align:center;">
      <h2 style="color:#1B326B; margin-top:0;">¡Hola ${user.firstName || ""} ${user.lastName || ""}!</h2>

      <p style="font-size:16px; line-height:1.6;">
        Tu <strong>factura electrónica</strong> ha sido <strong>autorizada por el SRI ✅</strong>.
      </p>

      <div style="text-align:left; margin:20px auto 0; max-width:520px; background:#f7f9ff; border:1px solid #e2e8ff; border-radius:10px; padding:16px;">
        <p style="margin:6px 0; font-size:14px;"><strong>Factura:</strong> ${doc.documento}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Autorización:</strong> ${doc.autorizacion}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Curso:</strong> ${course?.nombre || pagoFresh.curso || "Curso"}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Total:</strong> $${doc.total}</p>
      </div>

      <div style="margin-top:28px;">
        ${doc.url_ride ? `
        <a href="${doc.url_ride}" target="_blank" style="display:inline-block; background-color:#1B326B; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
          Descargar RIDE (PDF)
        </a>` : ""}

        ${doc.url_xml ? `
        <a href="${doc.url_xml}" target="_blank" style="display:inline-block; background-color:#0f2450; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
          Descargar XML
        </a>` : ""}
      </div>

      <p style="margin-top:26px; font-size:14px; color:#666;">
        Si tienes alguna duda, responde a este correo y con gusto te ayudamos.
      </p>
    </div>

    <div style="background-color:#f0f0f0; text-align:center; padding:15px; font-size:12px; color:#999;">
      © ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.
    </div>
  </div>
</div>
            `,
          });

          await Pagos.update(
            {
              contificoEmailEnviado: true,
              contificoEmailEnviadoAt: new Date(),
            },
            { where: { id: pagoFresh.id } }
          );

          console.log("✅ Email enviado curso:", doc.documento);
        } catch (err) {
          console.error("❌ Error procesando pago curso:", pago.id, err.message);
        }
      }

      /* =========================
         PAGOS PROGRAMAS
      ========================= */
      const pendientesProgramas = await ProgramaPagos.findAll({
        where: {
          contificoDocumentoId: { [Op.ne]: null },
          contificoAutorizacion: null,
          contificoEmailEnviado: false,
        },
        order: [["updatedAt", "ASC"]],
        limit: 20,
      });

      for (const pago of pendientesProgramas) {
        try {
          const doc = await contificoGetDocumentoById(pago.contificoDocumentoId);

          await ProgramaPagos.update(
            {
              contificoEstado: doc.estado,
              contificoAutorizacion: doc.autorizacion,
              contificoUrlRide: doc.url_ride,
              contificoUrlXml: doc.url_xml,
              contificoFirmado: doc.firmado,
            },
            { where: { id: pago.id } }
          );

          if (!doc.autorizacion) continue;

          const pagoFresh = await ProgramaPagos.findByPk(pago.id);
          if (!pagoFresh || pagoFresh.contificoEmailEnviado) continue;

          const ins = await ProgramaInscripciones.findByPk(
            pagoFresh.programaInscripcioneId
          );

          if (!ins) continue;

          const [user, programa] = await Promise.all([
            User.findByPk(ins.userId),
            ProgramasSuperiores.findByPk(ins.programasSuperioreId),
          ]);

          if (!user?.email) continue;

          await sendEmail({
            to: user.email,
            subject: `📄 Factura autorizada SRI - EDUKA (${doc.documento})`,
            html: `
<div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
    <div style="text-align:center; background-color:#1B326B; padding:20px;">
      <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width:150px;" />
    </div>

    <div style="padding:30px; text-align:center;">
      <h2 style="color:#1B326B; margin-top:0;">¡Hola ${user.firstName || ""} ${user.lastName || ""}!</h2>

      <p style="font-size:16px; line-height:1.6;">
        Tu <strong>factura electrónica</strong> ha sido <strong>autorizada por el SRI ✅</strong>.
      </p>

      <div style="text-align:left; margin:20px auto 0; max-width:520px; background:#f7f9ff; border:1px solid #e2e8ff; border-radius:10px; padding:16px;">
        <p style="margin:6px 0; font-size:14px;"><strong>Factura:</strong> ${doc.documento}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Autorización:</strong> ${doc.autorizacion}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Programa:</strong> ${programa?.nombre || "Programa Superior"}</p>
        <p style="margin:6px 0; font-size:14px;"><strong>Total:</strong> $${doc.total}</p>
      </div>

      <div style="margin-top:28px;">
        ${doc.url_ride ? `
        <a href="${doc.url_ride}" target="_blank" style="display:inline-block; background-color:#1B326B; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
          Descargar RIDE (PDF)
        </a>` : ""}

        ${doc.url_xml ? `
        <a href="${doc.url_xml}" target="_blank" style="display:inline-block; background-color:#0f2450; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
          Descargar XML
        </a>` : ""}
      </div>

      <p style="margin-top:26px; font-size:14px; color:#666;">
        Si tienes alguna duda, responde a este correo y con gusto te ayudamos.
      </p>
    </div>

    <div style="background-color:#f0f0f0; text-align:center; padding:15px; font-size:12px; color:#999;">
      © ${new Date().getFullYear()} EDUKA. Todos los derechos reservados.
    </div>
  </div>
</div>
            `,
          });

          await ProgramaPagos.update(
            {
              contificoEmailEnviado: true,
              contificoEmailEnviadoAt: new Date(),
            },
            { where: { id: pagoFresh.id } }
          );

          console.log("✅ Email enviado programa:", doc.documento);
        } catch (err) {
          console.error("❌ Error procesando pago programa:", pago.id, err.message);
        }
      }
    } catch (error) {
      console.error("❌ Error general cron:", error.message);
    } finally {
      running = false;
    }
  });

  console.log("⏱️ Cron Contifico activo (cada 2 minutos)");
};

module.exports = startContificoCron;