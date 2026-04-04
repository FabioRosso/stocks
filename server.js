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

app.get('/api/prices', async (req, res) => {
  try {
    const [cgData, yahooVT, yahooSP] = await Promise.all([
      httpGet('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether-gold&vs_currencies=usd'),
      httpGet('https://query1.finance.yahoo.com/v8/finance/chart/VT?interval=1d&range=1d'),
      httpGet('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d')
    ]);

    const cg = JSON.parse(cgData);
    const results = {};

    if (cg.bitcoin) results.BTC = cg.bitcoin.usd;
    if (cg['tether-gold']) results.GOLD = cg['tether-gold'].usd;

    try {
      const vt = JSON.parse(yahooVT);
      results.VT = vt.chart.result[0].meta.regularMarketPrice;
    } catch (e) {}

    try {
      const sp = JSON.parse(yahooSP);
      results.SP500 = sp.chart.result[0].meta.regularMarketPrice;
    } catch (e) {}

    res.json(results);
  } catch (err) {
    console.error('Price fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
