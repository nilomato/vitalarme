export async function sendSms(env, to, body) {
  const base = env.TWILIO_API_BASE || 'https://api.twilio.com';
  const url = `${base}/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form,
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (response.ok) {
      return { outcome: 'aceito', sid: data && data.sid ? String(data.sid) : null, errorCode: null, errorText: null };
    }
    if (response.status >= 500) {
      return { outcome: 'incerto', sid: null, errorCode: response.status, errorText: 'Resposta de erro do servidor do Twilio' };
    }
    return {
      outcome: 'falha',
      sid: null,
      errorCode: data && Number.isInteger(data.code) ? data.code : response.status,
      errorText: 'Solicitação recusada pelo Twilio'
    };
  } catch {
    return { outcome: 'incerto', sid: null, errorCode: null, errorText: 'Sem resposta confirmada do Twilio' };
  } finally {
    clearTimeout(timer);
  }
}
