const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function getGooglePrice(path) {
  const html = await httpGet(`https://www.google.com/finance/quote/${path}`);
  const match = html.match(/data-last-price="([^"]+)"/);
  return match ? parseFloat(match[1]) : null;
}

app.get('/api/prices', async (req, res) => {
  try {
    const [cgData, vtPrice, spPrice] = await Promise.all([
      httpGet('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether-gold&vs_currencies=usd'),
      getGooglePrice('VT:NYSEARCA'),
      getGooglePrice('.INX:INDEXSP')
    ]);

    const cg = JSON.parse(cgData);
    const results = {};

    if (cg.bitcoin) results.BTC = cg.bitcoin.usd;
    if (cg['tether-gold']) results.GOLD = cg['tether-gold'].usd;
    if (vtPrice) results.VT = vtPrice;
    if (spPrice) results.SP500 = spPrice;

    res.json(results);
  } catch (err) {
    console.error('Price fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
