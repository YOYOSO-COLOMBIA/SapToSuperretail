const axios = require('axios');
const https = require('https');
const { sap } = require('../config/env');

function buildHttpsAgent() {
  return new https.Agent({
    rejectUnauthorized: sap.rejectUnauthorized
  });
}

async function loginSap() {
  const url = `${sap.baseUrl}${sap.loginPath}`;

  const response = await axios.post(
    url,
    {
      CompanyDB: sap.companyDb,
      UserName: sap.username,
      Password: sap.password
    },
    {
      timeout: sap.timeoutMs,
      httpsAgent: buildHttpsAgent(),
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Error en Login SAP (${response.status}): ${JSON.stringify(response.data)}`);
  }

  const cookies = response.headers['set-cookie'] || [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

  if (!cookieHeader) {
    throw new Error('No se recibieron cookies de sesión desde SAP.');
  }

  return {
    cookieHeader,
    responseBody: response.data
  };
}

module.exports = { loginSap, buildHttpsAgent };
