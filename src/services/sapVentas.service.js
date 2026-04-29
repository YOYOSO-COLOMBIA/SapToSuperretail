const axios = require('axios');
const { sap } = require('../config/env');
const { buildHttpsAgent } = require('./sapAuth.service');

const SALES_DEFAULTS = {
  invoiceSeries: 115,
  cashAccount: '11100504'
};

async function validateBusinessPartnerExists(ticket, cookieHeader) {
  const encodedCardCode = encodeURIComponent(ticket.cardCode);
  const url = `${sap.baseUrl}${sap.businessPartnersPath}('${encodedCardCode}')`;

  const response = await axios.get(url, {
    timeout: sap.timeoutMs,
    httpsAgent: buildHttpsAgent(),
    headers: {
      Cookie: cookieHeader,
      Accept: 'application/json'
    },
    validateStatus: () => true
  });

  if (response.status === 404) {
    throw new Error(`El cliente ${ticket.cardCode} no existe en SAP. Esta fase solo procesa clientes existentes.`);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Error consultando BusinessPartner ${ticket.cardCode} (${response.status}): ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

async function createInvoice(ticket, cookieHeader) {
  const payload = buildInvoicePayload(ticket);
  return postToSap(sap.invoicesPath, payload, cookieHeader, `Invoice ${ticket.ticketKey}`);
}

async function createIncomingPayment(ticket, invoiceDocEntry, cookieHeader) {
  const payload = buildIncomingPaymentPayload(ticket, invoiceDocEntry);
  return postToSap(sap.incomingPaymentsPath, payload, cookieHeader, `IncomingPayment ${ticket.ticketKey}`);
}

async function createIncomingPaymentForMethod(ticket, payment, invoiceDocEntry, cookieHeader) {
  const payload = buildIncomingPaymentPayloadForMethod(ticket, payment, invoiceDocEntry);
  try {
    return await postToSap(
      sap.incomingPaymentsPath,
      payload,
      cookieHeader,
      `IncomingPayment ${ticket.ticketKey} metodo ${payment.paymentMethodCode || 'NA'}`
    );
  } catch (error) {
    throw new Error(
      `${error.message} | cashAccount=${payload.CashAccount} | amount=${payload.CashSum} | paymentMethodCode=${payment.paymentMethodCode || 'NA'} | payload=${JSON.stringify(payload)}`
    );
  }
}

async function postToSap(path, payload, cookieHeader, label) {
  const url = `${sap.baseUrl}${path}`;
  const response = await axios.post(url, payload, {
    timeout: sap.timeoutMs,
    httpsAgent: buildHttpsAgent(),
    headers: {
      Cookie: cookieHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Error creando ${label} (${response.status}): ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

function buildInvoicePayload(ticket) {
  validateTicket(ticket);

  return {
    CardCode: ticket.cardCode,
    DocDate: ticket.docDate,
    DocDueDate: ticket.docDate,
    TaxDate: ticket.docDate,
    NumAtCard: buildNumAtCard(ticket),
    Comments: ticket.comments || `Venta ${ticket.ticketNumber}`,
    Series: SALES_DEFAULTS.invoiceSeries,
    DocumentLines: ticket.lines.map((line) => ({
      ItemCode: line.itemCode,
      Quantity: line.quantity,
      UnitPrice: line.unitPrice,
      WarehouseCode: line.warehouseCode,
      TaxCode: line.taxCode,
      CostingCode: line.costingCode,
      ...(line.costingCode2 ? { CostingCode2: line.costingCode2 } : {})
    }))
  };
}

function buildIncomingPaymentPayload(ticket, invoiceDocEntry) {
  validateTicket(ticket);
  const total = calculateExpectedInvoiceTotal(ticket);

  return {
    CardCode: ticket.cardCode,
    DocDate: ticket.docDate,
    DueDate: ticket.docDate,
    TaxDate: ticket.docDate,
    CashAccount: SALES_DEFAULTS.cashAccount,
    CashSum: total,
    PaymentInvoices: [
      {
        DocEntry: invoiceDocEntry,
        SumApplied: total,
        InvoiceType: 'it_Invoice'
      }
    ]
  };
}

function buildIncomingPaymentPayloadForMethod(ticket, payment, invoiceDocEntry) {
  validateTicket(ticket);

  if (!payment.cashAccount) {
    throw new Error(`El ticket ${ticket.ticketKey} tiene un medio de pago sin cd_codigocuenta`);
  }

  const amount = roundMoney(payment.amount);
  if (!(amount > 0)) {
    throw new Error(`El ticket ${ticket.ticketKey} tiene un medio de pago con valor invalido`);
  }

  return {
    CardCode: ticket.cardCode,
    DocDate: ticket.docDate,
    DueDate: ticket.docDate,
    TaxDate: ticket.docDate,
    CashAccount: payment.cashAccount,
    CashSum: amount,
    PaymentInvoices: [
      {
        DocEntry: invoiceDocEntry,
        SumApplied: amount,
        InvoiceType: 'it_Invoice'
      }
    ]
  };
}

function buildNumAtCard(ticket) {
  return [
    ticket.eventType,
    ticket.storeCode,
    ticket.cashRegisterCode,
    ticket.ticketNumber
  ].join('-');
}

function validateTicket(ticket) {
  if (!ticket.cardCode) {
    throw new Error(`El ticket ${ticket.ticketKey} no tiene cd_codigocliente`);
  }

  if (!ticket.docDate) {
    throw new Error(`El ticket ${ticket.ticketKey} no tiene dt_diaoperativo`);
  }

  if (!Array.isArray(ticket.lines) || ticket.lines.length === 0) {
    throw new Error(`El ticket ${ticket.ticketKey} no tiene lineas para facturar`);
  }

  for (const line of ticket.lines) {
    if (!line.itemCode) {
      throw new Error(`El ticket ${ticket.ticketKey} tiene una linea sin cd_codigoarticulo`);
    }
    if (!line.warehouseCode) {
      throw new Error(`El ticket ${ticket.ticketKey} tiene una linea sin cd_codigotienda`);
    }
  }
}

function getDocEntry(response, entityName) {
  const docEntry = response?.DocEntry;
  if (docEntry === undefined || docEntry === null) {
    throw new Error(`La respuesta de ${entityName} no devolvio DocEntry: ${JSON.stringify(response)}`);
  }

  return Number(docEntry);
}

function getDocumentInfo(response, entityName) {
  return {
    docEntry: getDocEntry(response, entityName),
    docNum: response?.DocNum ?? null
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateExpectedInvoiceTotal(ticket) {
  validateTicket(ticket);

  return roundMoney(ticket.lines.reduce((sum, line) => {
    const net = Number(line.quantity) * Number(line.unitPrice);
    const taxMultiplier = 1 + getTaxRate(line.taxCode);
    return sum + (net * taxMultiplier);
  }, 0));
}

function getTaxRate(taxCode) {
  const normalized = String(taxCode || '').trim().toUpperCase();

  if (!normalized) return 0;
  if (normalized === 'IVAG02') return 0.19;

  return 0;
}

module.exports = {
  validateBusinessPartnerExists,
  createInvoice,
  createIncomingPayment,
  createIncomingPaymentForMethod,
  getDocEntry,
  getDocumentInfo,
  roundMoney,
  calculateExpectedInvoiceTotal
};
