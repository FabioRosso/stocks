const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Yahoo Finance requires cookie + crumb for cloud server requests
let cachedCrumb = null;
let cachedCookie = null;
let crumbExpiry = 0;

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', ...headers } }, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'];
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, cookies, statusCode: res.statusCode, headers: res.headers }));
    }).on('error', reject);
  });
}

async function getCrumb() {
  if (cachedCrumb && cachedCookie && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  // Step 1: Get consent cookie
  const consentRes = await httpGet('https://fc.yahoo.com');
  const setCookies = consentRes.cookies || [];
  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb using cookie
  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    'Cookie': cookieStr
  });

  if (crumbRes.data && !crumbRes.data.includes('<')) {
    cachedCrumb = crumbRes.data.trim();
    cachedCookie = cookieStr;
    crumbExpiry = Date.now() + 1000 * 60 * 30; // cache 30 min
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  throw new Error('Failed to get Yahoo Finance crumb');
}

app.get('/api/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { range, interval } = req.query;

  try {
    const { crumb, cookie } = await getCrumb();
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&crumb=${encodeURIComponent(crumb)}`;

    const chartRes = await httpGet(url, { 'Cookie': cookie });

    res.setHeader('Content-Type', 'application/json');

    if (chartRes.statusCode !== 200) {
      // Invalidate cache and retry once
      cachedCrumb = null;
      const retry = await getCrumb();
      const retryUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&crumb=${encodeURIComponent(retry.crumb)}`;
      const retryRes = await httpGet(retryUrl, { 'Cookie': retry.cookie });
      res.send(retryRes.data);
    } else {
      res.send(chartRes.data);
    }
  } catch (err) {
    console.error('Chart fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
