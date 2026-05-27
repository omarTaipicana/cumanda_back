const axios = require("axios");


const contifico = axios.create({
    baseURL: "https://api.contifico.com/sistema/api/v1",
    headers: {
        Authorization: process.env.CONTIFICO_API_KEY,
    },
    timeout: 20000,
});

const contificoV2 = axios.create({
    baseURL: "https://api.contifico.com/sistema/api/v2",
    headers: {
        Authorization: process.env.CONTIFICO_API_KEY,
    },
    timeout: 20000,
});

// helper: fecha dd/mm/yyyy
function formatDateDMY(date = new Date()) {

    // convertir a hora de Ecuador (UTC-5)
    const ecDate = new Date(
        date.toLocaleString("en-US", { timeZone: "America/Guayaquil" })
    );

    const d = String(ecDate.getDate()).padStart(2, "0");
    const m = String(ecDate.getMonth() + 1).padStart(2, "0");
    const y = ecDate.getFullYear();

    return `${d}/${m}/${y}`;
}

function ecDateYYYYMMDD(d = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);

    const y = parts.find(p => p.type === "year").value;
    const m = parts.find(p => p.type === "month").value;
    const day = parts.find(p => p.type === "day").value;
    return `${y}-${m}-${day}`; // YYYY-MM-DD
}


function formatDateContifico(date = new Date()) {
    const ecDate = new Date(
        date.toLocaleString("en-US", { timeZone: "America/Guayaquil" })
    );

    const y = ecDate.getFullYear();
    const m = String(ecDate.getMonth() + 1).padStart(2, "0");
    const d = String(ecDate.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
}

function ecTimeHHMMSS(d = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Guayaquil",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(d); // HH:MM:SS
}

async function contificoPing() {
    const { data } = await contifico.get("/persona/");
    return data;
}

async function contificoBuscarPersonaPorIdentificacion(identificacion) {
    const { data } = await contifico.get("/persona/", {
        params: { identificacion },
    });
    return data;
}

async function contificoCrearPersonaCliente({
    cedula,
    email,
    firstName,
    lastName,
    telefonos = "",
    direccion = "",
}) {
    const payload = {
        tipo: "N",
        razon_social: `${firstName} ${lastName}`.trim(),
        nombre_comercial: null,
        telefonos,
        ruc: "",
        cedula,
        direccion,
        email,
        es_extranjero: false,
        es_cliente: true,
        es_proveedor: false,
        es_empleado: false,
        es_vendedor: false,
        aplicar_cupo: false,
        porcentaje_descuento: null,
        id: null,
    };

    const { data } = await contifico.post("/persona/", payload, {
        params: { pos: process.env.CONTIFICO_POS_TOKEN },
    });

    return data;
}

async function contificoBuscarOCrearPersona(params) {
    const encontrados = await contificoBuscarPersonaPorIdentificacion(params.cedula);

    if (Array.isArray(encontrados) && encontrados.length > 0 && encontrados[0]?.id) {
        return encontrados[0];
    }

    return await contificoCrearPersonaCliente(params);
}

async function contificoBuscarProductoPorCodigo(codigo) {
    const { data } = await contificoV2.get("/producto/", {
        params: { filtro: codigo },
    });
    return data;
}

async function contificoListarProductos() {
    const { data } = await contificoV2.get("/producto/", {
        params: { page: 1, limit: 50 },
        timeout: 60000,
    });
    return data;
}

async function contificoCrearFacturaIva0({
    documento,
    personaId,
    cedula,
    email,
    razon_social,
    direccion = "",
    telefonos = "",
    total,
    descripcionItem,
}) {
    const totalNum = Number(total);

    const payload = {
        pos: process.env.CONTIFICO_POS_TOKEN,
        fecha_emision: formatDateDMY(),
        tipo_documento: "FAC",
        tipo_registro: "CLI",
        documento,
        autorizacion: "",
        electronico: true,

        subtotal_0: totalNum,
        subtotal_12: 0,
        iva: 0,
        ice: 0,
        total: totalNum,

        cliente: {
            id: personaId,
            cedula,
            email,
            razon_social,
            direccion,
            telefonos,
            tipo: "N",
            es_cliente: true,
        },

        detalles: [
            {
                producto_id: process.env.CONTIFICO_PRODUCTO_ID,
                cantidad: 1,
                precio: totalNum,
                porcentaje_iva: 0,
                porcentaje_descuento: 0,
                base_cero: totalNum,
                base_gravable: 0,
                base_no_gravable: 0,
                valor_ice: 0,
                ice: 0,
                descripcion: descripcionItem || "Pago Eduka",
            },
        ],
    };

    const { data } = await contifico.post("/documento/", payload);
    return data;
}

async function contificoListarDocumentos(params = {}) {
    const {
        tipo = "FAC",
        tipo_registro = "CLI",
        result_size = 50,
        result_page = 1,
        fecha_inicial,
        fecha_final,
    } = params;

    const query = { tipo, tipo_registro, result_size, result_page };
    if (fecha_inicial) query.fecha_inicial = fecha_inicial;
    if (fecha_final) query.fecha_final = fecha_final;

    const { data } = await contifico.get("/registro/documento/", { params: query });
    return data;
}

async function contificoGetDocumentoById(id) {
    const { data } = await contifico.get(`/documento/${id}/`);
    return data;
}

function contificoExtraerSecuencial(documento) {
    const parts = documento?.split("-");
    return Number(parts?.[2]);
}

function contificoFormatearDocumento(numero, estab = "001", pto = "001") {
    return `${estab}-${pto}-${String(numero).padStart(9, "0")}`;
}

async function contificoGetSiguienteDocumento() {
    const { data } = await contifico.get("/registro/documento/", {
        params: {
            tipo: "FAC",
            tipo_registro: "CLI",
            result_size: 50,
            result_page: 1,
        },
    });

    const docs = data?.results || data || [];

    const secuenciales = docs
        .map((d) => contificoExtraerSecuencial(d.documento))
        .filter((n) => Number.isFinite(n));

    const max = secuenciales.length ? Math.max(...secuenciales) : 0;
    const siguiente = max + 1;

    return {
        documento: contificoFormatearDocumento(siguiente),
    };
}

async function contificoEnviarDocumentoAlSRI(documentoId) {
    const { data } = await contifico.put(`/documento/${documentoId}/sri/`);
    return data;
}

module.exports = {
    contificoPing,
    contificoBuscarPersonaPorIdentificacion,
    contificoCrearPersonaCliente,
    contificoBuscarOCrearPersona,
    contificoBuscarProductoPorCodigo,
    contificoListarProductos,
    contificoCrearFacturaIva0,
    contificoListarDocumentos,
    contificoGetDocumentoById,
    contificoExtraerSecuencial,
    contificoFormatearDocumento,
    contificoGetSiguienteDocumento,
    contificoEnviarDocumentoAlSRI,
};
