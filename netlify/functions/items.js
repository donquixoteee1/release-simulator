const itemsHandler = require('../../api/items');

exports.handler = async function handler(event) {
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  const body = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64')
    : event.body;
  const req = {
    method:event.httpMethod,
    headers,
    body,
    socket:{
      remoteAddress:headers['x-nf-client-connection-ip'] || headers['client-ip']
    }
  };
  const responseHeaders = {};
  let responseBody = '';
  const res = {
    statusCode:200,
    setHeader(name, value) {
      responseHeaders[name] = value;
    },
    end(chunk = '') {
      responseBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
  };

  await itemsHandler(req, res);

  return {
    statusCode:res.statusCode,
    headers:responseHeaders,
    body:responseBody
  };
};
