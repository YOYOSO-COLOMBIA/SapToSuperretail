const { loginSap } = require('../services/sapAuth.service');
const { getSantaClient } = require('../services/sapData.service');

(async () => {
  try {
    const { cookieHeader, responseBody } = await loginSap();
    const clients = await getSantaClient(cookieHeader);
    console.log('Login SAP OK');
    console.log('SessionId:', responseBody?.SessionId || 'sin SessionId visible');
    console.log('Clientes recibidos:', clients.length);
    process.exit(0);
  } catch (error) {
    console.error('Error validando SAP:', error.message);
    process.exit(1);
  }
})();
