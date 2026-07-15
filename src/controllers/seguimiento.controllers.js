
const { Op } = require("sequelize");
const catchError = require("../utils/catchError");

const Seguimiento = require("../models/Seguimiento");
const Inscripcion = require("../models/Inscripcion");
const User = require("../models/User");
const Pagos = require("../models/Pagos");

const TZ = "America/Guayaquil";

const getFechaEC = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

const getHoraEC = (date) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(date))
  );

/* =========================================================
   CREAR SEGUIMIENTO
========================================================= */
const create = catchError(async (req, res) => {
  const {
    inscripcionId,
    usuarioEdicion,
    resultado,
    observacion,
    proximoContacto,
  } = req.body;

  if (!inscripcionId) {
    return res.status(400).json({
      message: "La inscripción es obligatoria.",
    });
  }

  if (!usuarioEdicion || !String(usuarioEdicion).trim()) {
    return res.status(400).json({
      message: "El usuario que registra el seguimiento es obligatorio.",
    });
  }

  if (!resultado) {
    return res.status(400).json({
      message: "El resultado de la llamada es obligatorio.",
    });
  }

  if (!observacion || !String(observacion).trim()) {
    return res.status(400).json({
      message: "La observación es obligatoria.",
    });
  }

  const inscripcion = await Inscripcion.findByPk(inscripcionId);

  if (!inscripcion) {
    return res.status(404).json({
      message: "La inscripción no existe.",
    });
  }

  const seguimiento = await Seguimiento.create({
    inscripcionId,
    usuarioEdicion: String(usuarioEdicion).trim(),
    resultado,
    observacion: String(observacion).trim(),
    proximoContacto: proximoContacto || null,
  });

  const seguimientoCompleto = await Seguimiento.findByPk(seguimiento.id, {
    include: [
      {
        model: Inscripcion,
        as: "inscripcion",
        attributes: ["id", "curso", "userId", "courseId"],
        include: [
          {
            model: User,
            as: "user",
            attributes: [
              "id",
              "firstName",
              "lastName",
              "cI",
              "email",
              "cellular",
            ],
          },
        ],
      },
    ],
  });

  const io = req.app.get("io");

  if (io) {
    io.emit("seguimientoCreado", seguimientoCompleto);
  }

  return res.status(201).json(seguimientoCompleto);
});

/* =========================================================
   LISTAR SEGUIMIENTOS
========================================================= */
const getAll = catchError(async (req, res) => {
  const {
    inscripcionId,
    curso,
    usuarioEdicion,
    resultado,
    desde,
    hasta,
    page = 1,
    limit = 20,
  } = req.query;

  const where = {};

  if (inscripcionId) {
    where.inscripcionId = inscripcionId;
  }

  if (usuarioEdicion && usuarioEdicion !== "todos") {
    where.usuarioEdicion = usuarioEdicion;
  }

  if (resultado && resultado !== "todos") {
    where.resultado = resultado;
  }

  if (desde || hasta) {
    where.createdAt = {};

    if (desde) {
      where.createdAt[Op.gte] = new Date(`${desde}T00:00:00-05:00`);
    }

    if (hasta) {
      where.createdAt[Op.lte] = new Date(
        `${hasta}T23:59:59.999-05:00`
      );
    }
  }

  const includeInscripcion = {
    model: Inscripcion,
    as: "inscripcion",
    attributes: [
      "id",
      "curso",
      "userId",
      "courseId",
      "createdAt",
    ],
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "firstName",
          "lastName",
          "cI",
          "email",
          "cellular",
        ],
      },
    ],
  };

  if (curso && curso !== "todos") {
    includeInscripcion.where = {
      curso,
    };
    includeInscripcion.required = true;
  }

  const pageInt = Math.max(1, parseInt(page, 10) || 1);
  const limitInt = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageInt - 1) * limitInt;

  const { count, rows } = await Seguimiento.findAndCountAll({
    where,
    include: [includeInscripcion],
    order: [["createdAt", "DESC"]],
    limit: limitInt,
    offset,
    distinct: true,
  });

  return res.json({
    total: count,
    page: pageInt,
    limit: limitInt,
    totalPages: Math.ceil(count / limitInt),
    data: rows,
  });
});

/* =========================================================
   OBTENER UN SEGUIMIENTO
========================================================= */
const getOne = catchError(async (req, res) => {
  const { id } = req.params;

  const seguimiento = await Seguimiento.findByPk(id, {
    include: [
      {
        model: Inscripcion,
        as: "inscripcion",
        attributes: [
          "id",
          "curso",
          "userId",
          "courseId",
          "createdAt",
        ],
        include: [
          {
            model: User,
            as: "user",
            attributes: [
              "id",
              "firstName",
              "lastName",
              "cI",
              "email",
              "cellular",
            ],
          },
        ],
      },
    ],
  });

  if (!seguimiento) {
    return res.status(404).json({
      message: "Seguimiento no encontrado.",
    });
  }

  return res.json(seguimiento);
});

/* =========================================================
   HISTORIAL DE UNA INSCRIPCIÓN
========================================================= */
const getByInscripcion = catchError(async (req, res) => {
  const { inscripcionId } = req.params;

  const inscripcion = await Inscripcion.findByPk(inscripcionId, {
    attributes: [
      "id",
      "curso",
      "userId",
      "courseId",
      "createdAt",
    ],
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "firstName",
          "lastName",
          "cI",
          "email",
          "cellular",
        ],
      },
    ],
  });

  if (!inscripcion) {
    return res.status(404).json({
      message: "Inscripción no encontrada.",
    });
  }

  const seguimientos = await Seguimiento.findAll({
    where: {
      inscripcionId,
    },
    order: [["createdAt", "DESC"]],
  });

  const pagos = await Pagos.findAll({
    where: {
      inscripcionId,
      confirmacion: true,
      verificado: true,
    },
    attributes: [
      "id",
      "inscripcionId",
      "valorDepositado",
      "createdAt",
      "verificado",
      "confirmacion",
      "pagoUrl",
    ],
    order: [["createdAt", "ASC"]],
    raw: true,
  });

  const primeraLlamada =
    seguimientos.length > 0
      ? seguimientos[seguimientos.length - 1]
      : null;

  // Todos los pagos confirmados y verificados de la inscripción
  const tienePago = pagos.length > 0;

  const montoTotalPagado = pagos.reduce(
    (total, pago) =>
      total + Number(pago.valorDepositado || 0),
    0
  );

  // Pagos posteriores a la primera llamada
  const pagosConvertidos = primeraLlamada
    ? pagos.filter(
      (pago) =>
        new Date(pago.createdAt) >=
        new Date(primeraLlamada.createdAt)
    )
    : [];

  // Solo se considera conversión cuando el pago ocurrió luego de una llamada
  const tieneCompraPorSeguimiento =
    pagosConvertidos.length > 0;

  const montoConvertido = pagosConvertidos.reduce(
    (total, pago) =>
      total + Number(pago.valorDepositado || 0),
    0
  );

  return res.json({
    inscripcion,
    totalSeguimientos: seguimientos.length,
    seguimientos,

    // Estado real de pagos
    tienePago,
    montoTotalPagado: Number(montoTotalPagado.toFixed(2)),
    pagosConfirmados: pagos,

    // Conversión atribuida al seguimiento
    tieneCompraPorSeguimiento,
    montoConvertido: Number(montoConvertido.toFixed(2)),
    pagosConvertidos,
  });
});

/* =========================================================
   ACTUALIZAR SEGUIMIENTO
========================================================= */
const update = catchError(async (req, res) => {
  const { id } = req.params;

  const seguimiento = await Seguimiento.findByPk(id);

  if (!seguimiento) {
    return res.status(404).json({
      message: "Seguimiento no encontrado.",
    });
  }

  const {
    usuarioEdicion,
    resultado,
    observacion,
    proximoContacto,
  } = req.body;

  await seguimiento.update({
    usuarioEdicion:
      usuarioEdicion !== undefined
        ? String(usuarioEdicion).trim()
        : seguimiento.usuarioEdicion,

    resultado:
      resultado !== undefined
        ? resultado
        : seguimiento.resultado,

    observacion:
      observacion !== undefined
        ? String(observacion).trim()
        : seguimiento.observacion,

    proximoContacto:
      proximoContacto !== undefined
        ? proximoContacto || null
        : seguimiento.proximoContacto,
  });

  const io = req.app.get("io");

  if (io) {
    io.emit("seguimientoActualizado", seguimiento);
  }

  return res.json(seguimiento);
});

/* =========================================================
   ELIMINAR SEGUIMIENTO
========================================================= */
const remove = catchError(async (req, res) => {
  const { id } = req.params;

  const seguimiento = await Seguimiento.findByPk(id);

  if (!seguimiento) {
    return res.status(404).json({
      message: "Seguimiento no encontrado.",
    });
  }

  await seguimiento.destroy();

  const io = req.app.get("io");

  if (io) {
    io.emit("seguimientoEliminado", {
      id,
      inscripcionId: seguimiento.inscripcionId,
    });
  }

  return res.sendStatus(204);
});

/* =========================================================
   DASHBOARD DE SEGUIMIENTOS
========================================================= */
const getDashboard = catchError(async (req, res) => {
  const {
    desde,
    hasta,
    curso,
    usuarioEdicion,
    resultado,
  } = req.query;

  const whereSeguimiento = {};

  if (usuarioEdicion && usuarioEdicion !== "todos") {
    whereSeguimiento.usuarioEdicion = usuarioEdicion;
  }

  if (resultado && resultado !== "todos") {
    whereSeguimiento.resultado = resultado;
  }

  if (desde || hasta) {
    whereSeguimiento.createdAt = {};

    if (desde) {
      whereSeguimiento.createdAt[Op.gte] = new Date(
        `${desde}T00:00:00-05:00`
      );
    }

    if (hasta) {
      whereSeguimiento.createdAt[Op.lte] = new Date(
        `${hasta}T23:59:59.999-05:00`
      );
    }
  }

  const includeInscripcion = {
    model: Inscripcion,
    as: "inscripcion",
    attributes: ["id", "curso", "userId", "courseId"],
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "firstName",
          "lastName",
          "cI",
          "email",
          "cellular",
        ],
      },
    ],
  };

  if (curso && curso !== "todos") {
    includeInscripcion.where = {
      curso,
    };
    includeInscripcion.required = true;
  }

  const seguimientos = await Seguimiento.findAll({
    where: whereSeguimiento,
    include: [includeInscripcion],
    order: [["createdAt", "ASC"]],
  });

  const inscripcionIds = [
    ...new Set(
      seguimientos
        .map((s) => String(s.inscripcionId))
        .filter(Boolean)
    ),
  ];

  let pagosVerificados = [];

  if (inscripcionIds.length > 0) {
    pagosVerificados = await Pagos.findAll({
      where: {
        inscripcionId: {
          [Op.in]: inscripcionIds,
        },
        confirmacion: true,
        verificado: true,
      },
      attributes: [
        "id",
        "inscripcionId",
        "valorDepositado",
        "createdAt",
      ],
      raw: true,
    });
  }

  /*
   * Primera llamada de cada inscripción.
   * Solo se atribuye la compra cuando el pago ocurrió
   * después de esa primera llamada.
   */
  const primeraLlamadaPorInscripcion = {};

  seguimientos.forEach((seguimiento) => {
    const inscripcionId = String(seguimiento.inscripcionId);

    if (
      !primeraLlamadaPorInscripcion[inscripcionId] ||
      new Date(seguimiento.createdAt) <
      new Date(
        primeraLlamadaPorInscripcion[inscripcionId].createdAt
      )
    ) {
      primeraLlamadaPorInscripcion[inscripcionId] = seguimiento;
    }
  });

  const pagosConvertidos = pagosVerificados.filter((pago) => {
    const primeraLlamada =
      primeraLlamadaPorInscripcion[
      String(pago.inscripcionId)
      ];

    if (!primeraLlamada) return false;

    return (
      new Date(pago.createdAt) >=
      new Date(primeraLlamada.createdAt)
    );
  });

  const inscripcionesConvertidas = new Set(
    pagosConvertidos.map((pago) =>
      String(pago.inscripcionId)
    )
  );

  const totalLlamadas = seguimientos.length;
  const totalContactados = inscripcionIds.length;
  const totalCompras = inscripcionesConvertidas.size;

  const montoVentas = pagosConvertidos.reduce(
    (total, pago) =>
      total + Number(pago.valorDepositado || 0),
    0
  );

  const tasaConversion =
    totalContactados > 0
      ? Number(
        (
          (totalCompras / totalContactados) *
          100
        ).toFixed(2)
      )
      : 0;

  const promedioLlamadasPorCompra =
    totalCompras > 0
      ? Number(
        (totalLlamadas / totalCompras).toFixed(2)
      )
      : 0;

  /* ======================
     LLAMADAS POR DÍA
  ====================== */
  const llamadasPorDiaMap = {};

  seguimientos.forEach((seguimiento) => {
    const fecha = getFechaEC(seguimiento.createdAt);

    llamadasPorDiaMap[fecha] =
      (llamadasPorDiaMap[fecha] || 0) + 1;
  });

  const llamadasPorDia = Object.entries(
    llamadasPorDiaMap
  )
    .map(([fecha, cantidad]) => ({
      fecha,
      cantidad,
    }))
    .sort(
      (a, b) =>
        new Date(a.fecha) - new Date(b.fecha)
    );

  /* ======================
     FRANJAS HORARIAS
  ====================== */
  const franjas = [
    { label: "00H-03H", from: 0, to: 3 },
    { label: "04H-07H", from: 4, to: 7 },
    { label: "08H-11H", from: 8, to: 11 },
    { label: "12H-15H", from: 12, to: 15 },
    { label: "16H-19H", from: 16, to: 19 },
    { label: "20H-23H", from: 20, to: 23 },
  ];

  const llamadasPorFranja = franjas.map((franja) => ({
    label: franja.label,
    value: 0,
  }));

  seguimientos.forEach((seguimiento) => {
    const hora = getHoraEC(seguimiento.createdAt);

    const franjaEncontrada = franjas.find(
      (franja) =>
        hora >= franja.from &&
        hora <= franja.to
    );

    if (!franjaEncontrada) return;

    const posicion = llamadasPorFranja.findIndex(
      (franja) =>
        franja.label === franjaEncontrada.label
    );

    if (posicion !== -1) {
      llamadasPorFranja[posicion].value++;
    }
  });

  /* ======================
     RESULTADOS DE LLAMADAS
  ====================== */
  const porResultadoMap = {};

  seguimientos.forEach((seguimiento) => {
    const valor =
      seguimiento.resultado || "sin_resultado";

    porResultadoMap[valor] =
      (porResultadoMap[valor] || 0) + 1;
  });

  const llamadasPorResultado = Object.entries(
    porResultadoMap
  ).map(([resultado, cantidad]) => ({
    resultado,
    cantidad,
  }));

  /* ======================
     CONVERSIÓN POR USUARIO
  ====================== */
  const porUsuarioMap = {};

  seguimientos.forEach((seguimiento) => {
    const asesor =
      seguimiento.usuarioEdicion || "Desconocido";

    const inscripcionId = String(
      seguimiento.inscripcionId
    );

    if (!porUsuarioMap[asesor]) {
      porUsuarioMap[asesor] = {
        usuario: asesor,
        llamadas: 0,
        inscripciones: new Set(),
        compras: new Set(),
        monto: 0,
      };
    }

    porUsuarioMap[asesor].llamadas++;
    porUsuarioMap[asesor].inscripciones.add(
      inscripcionId
    );

    if (inscripcionesConvertidas.has(inscripcionId)) {
      porUsuarioMap[asesor].compras.add(
        inscripcionId
      );
    }
  });

  /*
   * El monto se atribuye al asesor que realizó
   * la primera llamada de la inscripción.
   */
  pagosConvertidos.forEach((pago) => {
    const primeraLlamada =
      primeraLlamadaPorInscripcion[
      String(pago.inscripcionId)
      ];

    const asesor =
      primeraLlamada?.usuarioEdicion ||
      "Desconocido";

    if (porUsuarioMap[asesor]) {
      porUsuarioMap[asesor].monto += Number(
        pago.valorDepositado || 0
      );
    }
  });

  const conversionPorUsuario = Object.values(
    porUsuarioMap
  ).map((item) => {
    const contactados = item.inscripciones.size;
    const compras = item.compras.size;

    return {
      usuario: item.usuario,
      llamadas: item.llamadas,
      contactados,
      compras,
      monto: Number(item.monto.toFixed(2)),
      tasaConversion:
        contactados > 0
          ? Number(
            (
              (compras / contactados) *
              100
            ).toFixed(2)
          )
          : 0,
    };
  });

  /* ======================
     CONVERSIÓN POR CURSO
  ====================== */
  const porCursoMap = {};

  seguimientos.forEach((seguimiento) => {
    const cursoSigla =
      seguimiento.inscripcion?.curso ||
      "Sin curso";

    const inscripcionId = String(
      seguimiento.inscripcionId
    );

    if (!porCursoMap[cursoSigla]) {
      porCursoMap[cursoSigla] = {
        curso: cursoSigla,
        llamadas: 0,
        inscripciones: new Set(),
        compras: new Set(),
      };
    }

    porCursoMap[cursoSigla].llamadas++;
    porCursoMap[cursoSigla].inscripciones.add(
      inscripcionId
    );

    if (inscripcionesConvertidas.has(inscripcionId)) {
      porCursoMap[cursoSigla].compras.add(
        inscripcionId
      );
    }
  });

  const conversionPorCurso = Object.values(
    porCursoMap
  ).map((item) => {
    const contactados = item.inscripciones.size;
    const compras = item.compras.size;

    return {
      curso: item.curso,
      llamadas: item.llamadas,
      contactados,
      compras,
      tasaConversion:
        contactados > 0
          ? Number(
            (
              (compras / contactados) *
              100
            ).toFixed(2)
          )
          : 0,
    };
  });

  return res.json({
    totalLlamadas,
    totalContactados,
    totalCompras,
    montoVentas: Number(montoVentas.toFixed(2)),
    tasaConversion,
    promedioLlamadasPorCompra,

    llamadasPorDia,
    llamadasPorFranja,
    llamadasPorResultado,
    conversionPorUsuario,
    conversionPorCurso,
  });
});

module.exports = {
  create,
  getAll,
  getOne,
  getByInscripcion,
  update,
  remove,
  getDashboard,
};