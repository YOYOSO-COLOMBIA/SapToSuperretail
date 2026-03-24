const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');

async function insertLog(tx, payload) {
  const req = createRequest(tx);
  req.input('Proceso', payload.proceso);
  req.input('FechaInicio', payload.fechaInicio);
  req.input('FechaFin', payload.fechaFin);
  req.input('Estado', payload.estado);
  req.input('Mensaje', payload.mensaje || null);
  req.input('RegistrosItem', payload.registrosItem || 0);
  req.input('RegistrosClient', payload.registrosClient || 0);
  req.input('RegistrosStock', payload.registrosStock || 0);

  await req.query(`
    INSERT INTO ${tableName(app.schema, app.logTable)}
    (
      Proceso,
      FechaInicio,
      FechaFin,
      Estado,
      Mensaje,
      RegistrosItem,
      RegistrosClient,
      RegistrosStock
    )
    VALUES
    (
      @Proceso,
      @FechaInicio,
      @FechaFin,
      @Estado,
      @Mensaje,
      @RegistrosItem,
      @RegistrosClient,
      @RegistrosStock
    );
  `);
}

module.exports = { insertLog };
