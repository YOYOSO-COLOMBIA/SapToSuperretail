const { testConnection } = require('../services/sql.service');
const { closePool } = require('../config/sql');

(async () => {
  try {
    const ok = await testConnection();
    console.log(ok ? 'Conexión SQL OK' : 'Conexión SQL fallida');
    await closePool();
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error('Error de conexión SQL:', error.message);
    await closePool();
    process.exit(1);
  }
})();
