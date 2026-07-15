const {
  getAll,
  getDashboard,
  getByInscripcion,
  create,
  getOne,
  remove,
  update,
} = require("../controllers/seguimiento.controllers");

const express = require("express");
const verifyJWT = require("../utils/verifyJWT");

const seguimientoRouter = express.Router();

seguimientoRouter
  .route("/seguimiento")
  .get(getAll)
  .post(verifyJWT, create);

seguimientoRouter
  .route("/seguimiento_dashboard")
  .get(getDashboard);

seguimientoRouter
  .route("/seguimiento_inscripcion/:inscripcionId")
  .get(getByInscripcion);

seguimientoRouter
  .route("/seguimiento/:id")
  .get(getOne)
  .delete(verifyJWT, remove)
  .put(verifyJWT, update);

module.exports = seguimientoRouter;