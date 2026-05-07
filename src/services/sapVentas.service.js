const axios = require('axios');
const { sap, app } = require('../config/env');
const { buildHttpsAgent } = require('./sapAuth.service');

const DEFAULT_BP_ADDRESSES = [
  {
    AddressName: 'Principal',
    Street: 'Calle 123 #45-67',
    City: 'Bogota',
    County: 'Cundinamarca',
    Country: 'CO',
    ZipCode: '110111',
    AddressType: 'bo_BillTo'
  },
  {
    AddressName: 'Entrega',
    Street: 'Cra 10 #20-30',
    City: 'Bogota',
    County: 'Cundinamarca',
    Country: 'CO',
    ZipCode: '110111',
    AddressType: 'bo_ShipTo'
  }
];

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

async function createBusinessPartner(salesClient, cookieHeader) {
  const payload = buildBusinessPartnerPayload(salesClient);
  try {
    return await postToSap(sap.businessPartnersPath, payload, cookieHeader, `BusinessPartner ${salesClient.cardCode}`);
  } catch (error) {
    throw new Error(`${error.message} | payload=${JSON.stringify(payload)}`);
  }
}

async function createInvoice(ticket, cookieHeader) {
  const payload = buildCommercialDocumentPayload(ticket, app.salesInvoiceSeries);
  return postCommercialDocument(sap.invoicesPath, payload, cookieHeader, `Invoice ${ticket.ticketKey}`);
}

async function createCreditNote(ticket, cookieHeader) {
  const payload = buildCommercialDocumentPayload(ticket, app.salesCreditNoteSeries);
  return postCommercialDocument(sap.creditNotesPath, payload, cookieHeader, `CreditNote ${ticket.ticketKey}`);
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

async function postCommercialDocument(path, payload, cookieHeader, label) {
  try {
    const response = await postToSap(path, payload, cookieHeader, label);
    return {
      data: response,
      debug: {
        payload
      }
    };
  } catch (error) {
    throw new Error(`${error.message} | payload=${JSON.stringify(payload)}`);
  }
}

function buildInvoicePayload(ticket) {
  return buildCommercialDocumentPayload(ticket, app.salesInvoiceSeries);
}

function buildBusinessPartnerPayload(salesClient) {
  validateSalesClient(salesClient);

  return {
    CardCode: salesClient.cardCode,
    CardName: salesClient.cardName,
    CardType: 'cCustomer',
    GroupCode: 100,
    FederalTaxID: salesClient.cardCode,
    Phone1: salesClient.phone,
    Cellular: salesClient.cellular,
    EmailAddress: salesClient.email,
    U_HBT_MailRecep_FE: salesClient.email,
    U_HBT_RegTrib: salesClient.regTrib,
    U_HBT_TipDoc: salesClient.tipDoc,
    U_HBT_RegFis: salesClient.regFis,
    U_HBT_ActEco: '0010',
    U_HBT_MunMed: salesClient.cityCode,
    U_HBT_TipEnt: salesClient.tipEnt,
    U_HBT_ResFis: 'R-99-PN',
    U_HBT_MedPag: '1',
    U_HBT_Residente: 'SI',
    BPAddresses: DEFAULT_BP_ADDRESSES
  };
}

function buildCommercialDocumentPayload(ticket, series) {
  validateTicket(ticket);

  return {
    CardCode: ticket.cardCode,
    DocDate: ticket.docDate,
    DocDueDate: ticket.docDate,
    TaxDate: ticket.docDate,
    NumAtCard: buildNumAtCard(ticket),
    Comments: ticket.comments || `Venta ${ticket.ticketNumber}`,
    Series: series,
    DocumentLines: ticket.lines.map((line) => buildDocumentLine(ticket, line))
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
        InvoiceType: resolvePaymentInvoiceType(ticket.documentType)
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
        InvoiceType: resolvePaymentInvoiceType(ticket.documentType)
      }
    ]
  };
}

function resolvePaymentInvoiceType(documentType) {
  if (documentType === 'credit-note') {
    return 'it_CredItnote';
  }

  return 'it_Invoice';
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

function validateSalesClient(salesClient) {
  if (!salesClient || !salesClient.cardCode) {
    throw new Error('Cliente de ventas sin cd_codigocliente');
  }
  if (!salesClient.cardName) {
    throw new Error(`El cliente ${salesClient.cardCode} no tiene ds_nombrecliente`);
  }
  if (!salesClient.email) {
    throw new Error(`El cliente ${salesClient.cardCode} no tiene ds_emailcliente`);
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
  const data = response?.data || response;
  return {
    docEntry: getDocEntry(data, entityName),
    docNum: data?.DocNum ?? null,
    docTotal: data?.DocTotal ?? null,
    responseData: data,
    debug: response?.debug || null
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateExpectedInvoiceTotal(ticket) {
  validateTicket(ticket);

  if (ticket.documentType === 'credit-note') {
    return roundMoney(ticket.lines.reduce((sum, line) => {
      return sum + calculatePositiveLineNet(line);
    }, 0));
  }

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

function buildDocumentLine(ticket, line) {
  const normalized = ticket.documentType === 'credit-note'
    ? normalizeCreditNoteLine(line)
    : {
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice)
      };

  return {
    ItemCode: line.itemCode,
    Quantity: normalized.quantity,
    UnitPrice: normalized.unitPrice,
    WarehouseCode: line.warehouseCode,
    TaxCode: line.taxCode,
    CostingCode: line.costingCode,
    ...(line.costingCode2 ? { CostingCode2: line.costingCode2 } : {})
  };
}

function normalizeCreditNoteLine(line) {
  const unitPrice = Number(line.unitPrice);

  return {
    quantity: Math.abs(Number(line.quantity)),
    unitPrice: Math.abs(unitPrice)
  };
}

function calculatePositiveLineNet(line) {
  return Math.abs(Number(line.quantity)) * Math.abs(Number(line.unitPrice));
}

module.exports = {
  validateBusinessPartnerExists,
  createBusinessPartner,
  createInvoice,
  createCreditNote,
  createIncomingPayment,
  createIncomingPaymentForMethod,
  getDocEntry,
  getDocumentInfo,
  roundMoney,
  calculateExpectedInvoiceTotal
};
