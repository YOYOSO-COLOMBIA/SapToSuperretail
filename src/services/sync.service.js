const { loginSap } = require('./sapAuth.service');
const { getSantaClient } = require('./sapData.service');
const { executeTransaction } = require('./sql.service');
const { upsertClienteMaestra } = require('../repositories/clientemaestra.repository');
const { insertLog } = require('../repositories/log.repository');

async function tryInsertLog(tx, payload) {
  try {
    await insertLog(tx, payload);
  } catch (_) {}
}

async function runSync() {
  const fechaInicio = new Date();

  try {
    const { cookieHeader } = await loginSap();
    const clients = await getSantaClient(cookieHeader);
    let syncResult;

    await executeTransaction(async (tx) => {
      syncResult = await upsertClienteMaestra(tx, clients);

      await tryInsertLog(tx, {
        proceso: 'SYNC_SAP_YOYOSO',
        fechaInicio,
        fechaFin: new Date(),
        estado: 'OK',
        mensaje: null,
        registrosItem: 0,
        registrosClient: clients.length,
        registrosStock: 0
      });
    });

    return {
      ok: true,
      items: 0,
      clients: clients.length,
      stock: 0,
      updated: syncResult.updated,
      inserted: syncResult.inserted
    };
  } catch (error) {
    try {
      await executeTransaction(async (tx) => {
        await tryInsertLog(tx, {
          proceso: 'SYNC_SAP_YOYOSO',
          fechaInicio,
          fechaFin: new Date(),
          estado: 'ERROR',
          mensaje: error.message,
          registrosItem: 0,
          registrosClient: 0,
          registrosStock: 0
        });
      });
    } catch (_) {}

    throw error;
  }
}

module.exports = { runSync };
