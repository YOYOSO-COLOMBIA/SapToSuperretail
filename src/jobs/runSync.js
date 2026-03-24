const { runSync } = require('../services/sync.service');
const logger = require('../utils/logger');
const { closePool } = require('../config/sql');

(async () => {
  try {
    logger.info('Iniciando sincronización SAP -> SQL Server');
    const result = await runSync();
    logger.info('Sincronización finalizada correctamente', result);
    await closePool();
    process.exit(0);
  } catch (error) {
    logger.error('Falló la sincronización', error.message);
    await closePool();
    process.exit(1);
  }
})();
