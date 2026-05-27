
const express = require("express");
const Pagos = require("../models/Pagos");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Course = require("../models/Course");

const axios = require("axios");

const { sendEmail } = require("../utils/sendEmail");

const {
    contificoPing,
    contificoBuscarPersonaPorIdentificacion,
    contificoCrearPersonaCliente,
    contificoBuscarOCrearPersona,
    contificoBuscarProductoPorCodigo,
    contificoListarProductos,
    contificoCrearFacturaIva0,
    contificoExtraerSecuencial,
    contificoListarDocumentos,
    contificoFormatearDocumento,
    contificoGetDocumentoById,
} = require("../utils/contifico.service");

const contifico = axios.create({
    baseURL: "https://api.contifico.com/sistema/api/v1",
    headers: {
        Authorization: process.env.CONTIFICO_API_KEY,
    },
    timeout: 20000,
});



const contificoRouter = express.Router();

contificoRouter.get("/test-contifico", async (req, res) => {
    try {
        const data = await contificoPing();
        res.json({ ok: true, total: data.length });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});

// ✅ buscar persona
contificoRouter.get("/contifico/persona", async (req, res) => {
    try {
        const { identificacion } = req.query;
        if (!identificacion) {
            return res.status(400).json({ ok: false, error: "Falta query ?identificacion=" });
        }
        const data = await contificoBuscarPersonaPorIdentificacion(identificacion);
        res.json({ ok: true, data });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});

contificoRouter.post("/contifico/persona", async (req, res) => {
    try {
        const data = await contificoCrearPersonaCliente(req.body);
        res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({
            ok: false,
            error: error.response?.data || error.message,
        });
    }
});

contificoRouter.post("/contifico/persona/buscar-o-crear", async (req, res) => {
    try {
        const data = await contificoBuscarOCrearPersona(req.body);
        res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});



contificoRouter.get("/contifico/producto", async (req, res) => {
    try {
        const { codigo } = req.query;
        if (!codigo) {
            return res.status(400).json({ ok: false, error: "Falta query ?codigo=" });
        }

        const data = await contificoBuscarProductoPorCodigo(codigo);
        res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});


contificoRouter.get("/contifico/productos", async (req, res) => {
    try {
        const data = await contificoListarProductos();
        res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});


contificoRouter.get("/contifico/categorias", async (req, res) => {
    try {
        const { data } = await contifico.get("/categoria/");
        res.json({ ok: true, count: Array.isArray(data) ? data.length : null, data });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.response?.data || e.message });
    }
});

contificoRouter.get("/contifico/bodegas", async (req, res) => {
    try {
        const { data } = await contifico.get("/bodega/");
        res.json({ ok: true, count: Array.isArray(data) ? data.length : null, data });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.response?.data || e.message });
    }
});


contificoRouter.get("/contifico/productos_paged", async (req, res) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 50);

        const { data } = await contifico.get("/producto/", {
            params: { page, limit }, // probamos paginación
        });

        res.json({
            ok: true,
            page,
            limit,
            count: Array.isArray(data) ? data.length : null,
            sample: Array.isArray(data) ? data[0] : null,
            data,
        });
    } catch (e) {
        console.error(e.response?.data || e.message);
        res.status(500).json({ ok: false, error: e.response?.data || e.message });
    }
});


contificoRouter.post("/contifico/factura/prueba", express.json(), async (req, res) => {
    try {
        const { pagoId, documento } = req.body || {};
        if (!pagoId || !documento) {
            return res.status(400).json({ ok: false, error: "Falta pagoId o documento" });
        }

        // traer pago + inscripción + user + curso
        const pago = await Pagos.findByPk(pagoId, {
            include: [
                {
                    model: Inscripcion,
                    include: [{ model: User }, { model: Course }],
                },
            ],
        });

        if (!pago) return res.status(404).json({ ok: false, error: "Pago no encontrado" });

        const ins = pago.inscripcion;
        const user = ins?.user;
        const course = ins?.course;

        if (!user) return res.status(400).json({ ok: false, error: "Pago sin usuario" });
        if (!user.contificoPersonaId) {
            return res.status(400).json({ ok: false, error: "Usuario sin contificoPersonaId" });
        }

        const total = Number(pago.valorDepositado);

        if (!Number.isFinite(total) || total <= 0) {
            return res.status(400).json({
                ok: false,
                error: `valorDepositado inválido: ${pago.valorDepositado}`,
            });
        }



        console.log("DEBUG total:", pago.valorDepositado, "->", total);
        console.log("DEBUG producto_id:", process.env.CONTIFICO_PRODUCTO_ID);
        console.log("DEBUG personaId:", user.contificoPersonaId);


        const data = await contificoCrearFacturaIva0({
            documento,
            personaId: user.contificoPersonaId,
            cedula: String(user.cI || "").trim(),
            email: String(user.email || "").trim(),
            razon_social: `${user.firstName} ${user.lastName}`.trim(),
            direccion: `${user.city || ""} ${user.province || ""}`.trim(),
            telefonos: user.cellular || "",
            total: total,
            descripcionItem: `Pago curso: ${course?.nombre || pago.curso || "Curso"}`,
        });

        // ...
        const doc = await contificoCrearFacturaIva0({
            documento,
            personaId: user.contificoPersonaId,
            cedula: String(user.cI || "").trim(),
            email: String(user.email || "").trim(),
            razon_social: `${user.firstName} ${user.lastName}`.trim(),
            direccion: `${user.city || ""} ${user.province || ""}`.trim(),
            telefonos: user.cellular || "",
            total,
            descripcionItem: `Pago curso: ${course?.nombre || pago.curso || "Curso"}`,
        });

        if (pago.contificoDocumentoId) {
            return res.status(400).json({ ok: false, error: "Este pago ya tiene factura contifico" });
        }

        // ✅ guardar en Pagos
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



        return res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});

contificoRouter.get("/contifico/factura/siguiente-documento", async (req, res) => {
    try {
        // Traer los últimos 50 documentos FAC/CLI (rápido)
        const docs = await contificoListarDocumentos({
            tipo: "FAC",
            tipo_registro: "CLI",
            result_size: 50,
            result_page: 1,
        });

        // Filtrar solo serie 001-001 (si quieres otra, cambia aquí)
        const estab = "001";
        const pto = "001";

        const secuenciales = (docs || [])
            .map((d) => contificoExtraerSecuencial(d.documento))
            .filter((n) => Number.isFinite(n));

        const max = secuenciales.length ? Math.max(...secuenciales) : 0;
        const siguiente = max + 1;

        const documento = contificoFormatearDocumento(siguiente, estab, pto);

        return res.json({ ok: true, max, siguiente, documento });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});

contificoRouter.get("/contifico/documento/:id", async (req, res) => {
    try {
        const data = await contificoGetDocumentoById(req.params.id);
        res.json({ ok: true, data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});

contificoRouter.post("/contifico/factura/sync", express.json(), async (req, res) => {
    try {
        const { pagoId } = req.body || {};
        if (!pagoId) return res.status(400).json({ ok: false, error: "Falta pagoId" });

        const pago = await Pagos.findByPk(pagoId);
        if (!pago) return res.status(404).json({ ok: false, error: "Pago no encontrado" });

        if (!pago.contificoDocumentoId) {
            return res.status(400).json({ ok: false, error: "Pago sin contificoDocumentoId" });
        }

        const doc = await contificoGetDocumentoById(pago.contificoDocumentoId);

        await Pagos.update(
            {
                contificoEstado: doc.estado,
                contificoAutorizacion: doc.autorizacion,
                contificoUrlRide: doc.url_ride,
                contificoUrlXml: doc.url_xml,
                contificoFirmado: doc.firmado,
            },
            { where: { id: pagoId } }
        );

        const autorizado = !!doc.autorizacion;

        // 🔁 Volvemos a consultar el pago actualizado
        const pagoActual = await Pagos.findByPk(pagoId);

        const yaEnviado = !!pagoActual.contificoEmailEnviado;

        if (autorizado && !yaEnviado) {

            const ins = await Inscripcion.findByPk(pagoActual.inscripcionId, {
                include: [{ model: User }, { model: Course }],
            });

            const user = ins?.user;
            const course = ins?.course;

            if (user?.email) {

                try {

                    await sendEmail({
                        to: user.email,
                        subject: `📄 Factura autorizada SRI - EDUKA (${doc.documento})`,
                        html: `
<div style="font-family: Arial, sans-serif; background-color: #f0f8ff; padding: 20px; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); overflow: hidden;">

    <div style="text-align: center; background-color: #1B326B; padding: 20px;">
      <img src="https://res.cloudinary.com/desgmhmg4/image/upload/v1765358711/eduka_2026_kh3h9e.png" alt="EDUKA" style="width: 150px;" />
    </div>

    <div style="padding: 30px; text-align: center;">
      <h2 style="color: #1B326B;">¡Hola ${user.firstName || ""} ${user.lastName || ""}!</h2>

      <p style="font-size: 16px; line-height: 1.6;">
        Tu <strong>factura electrónica</strong> ha sido <strong>autorizada por el SRI ✅</strong>.
      </p>

      <div style="text-align:left; margin: 20px auto 0; max-width: 520px; background:#f7f9ff; border:1px solid #e2e8ff; border-radius:10px; padding:16px;">
        <p><strong>Factura:</strong> ${doc.documento}</p>
        <p><strong>Autorización:</strong> ${doc.autorizacion}</p>
        <p><strong>Curso:</strong> ${course?.nombre || "Curso"}</p>
        <p><strong>Total:</strong> $${doc.total}</p>
      </div>

      <div style="margin-top: 28px;">
        ${doc.url_ride ? `
          <a href="${doc.url_ride}" target="_blank"
             style="display:inline-block; background-color:#1B326B; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
            Descargar RIDE (PDF)
          </a>` : ""}

        ${doc.url_xml ? `
          <a href="${doc.url_xml}" target="_blank"
             style="display:inline-block; background-color:#0f2450; color:white; padding:12px 20px; border-radius:5px; text-decoration:none; margin:6px;">
            Descargar XML
          </a>` : ""}
      </div>

      <p style="margin-top: 26px; font-size: 14px; color: #666;">
        Gracias por confiar en EDUKA.
      </p>
    </div>

    <div style="background-color: #f0f0f0; text-align: center; padding: 15px; font-size: 12px; color: #999;">
      © ${new Date().getFullYear()} EDUKA.
    </div>

  </div>
</div>`
                    });

                    // ✅ SOLO si el envío fue exitoso
                    await Pagos.update(
                        {
                            contificoEmailEnviado: true,
                            contificoEmailEnviadoAt: new Date(),
                        },
                        { where: { id: pagoId } }
                    );

                    console.log("✅ Email factura enviado:", doc.documento);

                } catch (mailError) {
                    console.error("❌ Error enviando email factura:", mailError);
                }
            }
        }

        return res.json({
            ok: true,
            estado: doc.estado,
            firmado: doc.firmado,
            autorizacion: doc.autorizacion,
            url_ride: doc.url_ride,
            url_xml: doc.url_xml,
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});




contificoRouter.get("/contifico/factura/estado/:pagoId", async (req, res) => {
    try {
        const { pagoId } = req.params;

        const pago = await Pagos.findByPk(pagoId, {
            attributes: [
                "id",
                "contificoDocumentoId",
                "contificoDocumentoNumero",
                "contificoEstado",
                "contificoFirmado",
                "contificoAutorizacion",
                "contificoUrlRide",
                "contificoUrlXml",
            ],
        });

        if (!pago) return res.status(404).json({ ok: false, error: "Pago no encontrado" });

        return res.json({ ok: true, data: pago });
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
});





contificoRouter.post("/contifico/factura/emitir", express.json(), async (req, res) => {
    try {
        const { pagoId } = req.body || {};
        if (!pagoId) return res.status(400).json({ ok: false, error: "Falta pagoId" });

        const pago = await Pagos.findByPk(pagoId, {
            include: [{ model: Inscripcion, include: [{ model: User }, { model: Course }] }],
        });
        if (!pago) return res.status(404).json({ ok: false, error: "Pago no encontrado" });

        // ✅ anti-duplicado
        if (pago.contificoDocumentoId) {
            return res.status(400).json({
                ok: false,
                error: `Este pago ya tiene factura: ${pago.contificoDocumentoNumero}`,
            });
        }

        const user = pago.inscripcion?.user;
        const course = pago.inscripcion?.course;

        if (!user) return res.status(400).json({ ok: false, error: "Pago sin usuario" });

        // (por ahora lo dejamos así, luego lo automatizamos con buscar/crear)
        if (!user.contificoPersonaId) {
            return res.status(400).json({ ok: false, error: "Usuario sin contificoPersonaId" });
        }

        const total = Number(pago.valorDepositado);
        if (!Number.isFinite(total) || total <= 0) {
            return res.status(400).json({ ok: false, error: `valorDepositado inválido: ${pago.valorDepositado}` });
        }

        // ✅ aquí usamos tu función nueva
        const { documento } = await contificoGetSiguienteDocumento();

        const doc = await contificoCrearFacturaIva0({
            documento,
            personaId: user.contificoPersonaId,
            cedula: String(user.cI || "").trim(),
            email: String(user.email || "").trim(),
            razon_social: `${user.firstName} ${user.lastName}`.trim(),
            direccion: `${user.city || ""} ${user.province || ""}`.trim(),
            telefonos: user.cellular || "",
            total,
            descripcionItem: `Pago curso: ${course?.nombre || pago.curso || "Curso"}`,
        });

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

        return res.json({ ok: true, data: doc });
    } catch (error) {
        console.error(error.response?.data || error.message);
        return res.status(500).json({ ok: false, error: error.response?.data || error.message });
    }
});





contificoRouter.post("/contifico/factura/emitir-manual", async (req, res) => {
  try {
    const { pagoId } = req.body;

    if (!pagoId) {
      return res.status(400).json({
        ok: false,
        error: "Falta pagoId",
      });
    }

    const pago = await Pagos.findByPk(pagoId, {
      include: [
        {
          model: Inscripcion,
          include: [{ model: User }, { model: Course }],
        },
      ],
    });

    if (!pago) {
      return res.status(404).json({
        ok: false,
        error: "Pago no encontrado",
      });
    }

    if (!pago.verificado) {
      return res.status(400).json({
        ok: false,
        error: "El pago aún no está verificado",
      });
    }

    // 🚨 evitar duplicados
    if (pago.contificoDocumentoId) {
      return res.json({
        ok: true,
        message: "La factura ya existe",
        factura: {
          contificoDocumentoId: pago.contificoDocumentoId,
          contificoDocumentoNumero: pago.contificoDocumentoNumero,
          contificoEstado: pago.contificoEstado,
          contificoFirmado: pago.contificoFirmado,
          contificoUrlRide: pago.contificoUrlRide,
          contificoUrlXml: pago.contificoUrlXml,
          contificoAutorizacion: pago.contificoAutorizacion,
        },
      });
    }

    const user = pago.inscripcion?.user;
    const course = pago.inscripcion?.course;

    if (!user) {
      return res.status(400).json({
        ok: false,
        error: "Pago sin usuario",
      });
    }

    const {
      contificoBuscarOCrearPersona,
      contificoGetSiguienteDocumento,
      contificoCrearFacturaIva0,
      contificoEnviarDocumentoAlSRI,
    } = require("../utils/contifico.service.js");

    // 1️⃣ Obtener o crear persona
    let personaId = user.contificoPersonaId;

    if (!personaId) {
      const persona = await contificoBuscarOCrearPersona({
        cedula: String(user.cI || "").trim(),
        email: String(user.email || "").trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        telefonos: user.cellular || "",
        direccion: `${user.city || ""} ${user.province || ""}`.trim(),
      });

      personaId = persona.id;

      await User.update(
        { contificoPersonaId: personaId },
        { where: { id: user.id } }
      );
    }

    // 2️⃣ Obtener siguiente número de factura
    const { documento } = await contificoGetSiguienteDocumento();

    // 3️⃣ Crear factura
    const doc = await contificoCrearFacturaIva0({
      documento,
      personaId,
      cedula: String(user.cI || "").trim(),
      email: String(user.email || "").trim(),
      razon_social: `${user.firstName} ${user.lastName}`.trim(),
      direccion: `${user.city || ""} ${user.province || ""}`.trim(),
      telefonos: user.cellular || "",
      total: Number(pago.valorDepositado),
      descripcionItem: `Pago curso: ${course?.nombre || pago.curso}`,
    });

    // 4️⃣ Guardar vínculo en BD
    await Pagos.update(
      {
        contificoDocumentoId: doc.id,
        contificoDocumentoNumero: doc.documento,
        contificoEstado: doc.estado,
        contificoFirmado: doc.firmado,
        contificoUrlRide: doc.url_ride,
        contificoUrlXml: doc.url_xml,
        contificoAutorizacion: doc.autorizacion || null,
      },
      { where: { id: pago.id } }
    );

    // 5️⃣ Enviar documento al SRI
    try {
      await contificoEnviarDocumentoAlSRI(doc.id);
      console.log("🚀 Documento enviado al SRI:", doc.documento);
    } catch (sriError) {
      console.error(
        "❌ Error enviando al SRI:",
        sriError.response?.data || sriError.message
      );
    }

    return res.json({
      ok: true,
      message: "Factura emitida correctamente",
      factura: {
        contificoDocumentoId: doc.id,
        contificoDocumentoNumero: doc.documento,
        contificoEstado: doc.estado,
        contificoFirmado: doc.firmado,
        contificoUrlRide: doc.url_ride,
        contificoUrlXml: doc.url_xml,
        contificoAutorizacion: doc.autorizacion || null,
      },
    });
  } catch (error) {
    const err = error.response?.data;

    // manejar error típico de contifico
    if (err?.cod_error === 1001) {
      return res.status(400).json({
        ok: false,
        error: "Documento ya existe en Contífico",
      });
    }

    console.error("❌ Error Contífico:", err || error.message);

    return res.status(500).json({
      ok: false,
      error: err || error.message,
    });
  }
});







module.exports = contificoRouter;