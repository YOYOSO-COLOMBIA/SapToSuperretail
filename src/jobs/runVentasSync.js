const { runSync } = require('../services/sync.service');
const logger = require('../utils/logger');
const { closePool } = require('../config/sql');

(async () => {
  try {
    logger.info('Iniciando sincronizacion SQL VENTAS -> SAP');
    const result = await runSync({ mode: 'ventas' });
    logger.info('Sincronizacion SQL VENTAS -> SAP finalizada correctamente', result);
    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error('Fallo la sincronizacion SQL VENTAS -> SAP', error.message);
    await closePool();
    process.exit(1);
  }
})();
