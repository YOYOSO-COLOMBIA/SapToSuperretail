const { createRequest, tableName } = require('../services/sql.service');
const { app } = require('../config/env');

async function replaceSantaClient(tx, rows) {
  const reqDelete = createRequest(tx);
  await reqDelete.query(`DELETE FROM ${tableName(app.schema, 'SANTACLIENT')};`);

  if (!app.modeJsonStaging) {
    throw new Error('replaceSantaClient requiere mapeo real de columnas. Cambia MODE_JSON_STAGING o ajusta el repositorio.');
  }

  for (const row of rows) {
    const req = createRequest(tx);
    req.input('JsonData', JSON.stringify(row));
    await req.query(`INSERT INTO ${tableName(app.schema, 'SANTACLIENT')} (JsonData) VALUES (@JsonData);`);
  }
}

module.exports = { replaceSantaClient };
