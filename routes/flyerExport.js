const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');

router.post('/export-pdf', async (req, res) => {
  let browser = null;
  try {
    const { sku, quality, flyerHtml } = req.body;

    if (!sku || !quality || !flyerHtml) {
      return res.status(400).json({ error: 'Missing required fields: sku, quality, flyerHtml' });
    }
    if (quality !== 'print' && quality !== 'email') {
      return res.status(400).json({ error: 'quality must be "print" or "email"' });
    }

    // Puppeteer 起動（Render.com 用フラグ必須）
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    const deviceScaleFactor = quality === 'print' ? 2 : 1;
    await page.setViewport({ width: 1080, height: 1620, deviceScaleFactor });

    await page.setContent(flyerHtml, { waitUntil: 'networkidle0', timeout: 60000 });

    // PDF用の余白除去（body padding等を打ち消す）
    await page.addStyleTag({
      content: `
        @page { margin: 0; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
        .flyer {
          margin: 0 !important;
          box-shadow: none !important;
        }
      `
    });

    // フライヤーのアスペクト比 1080:1620 (= 2:3) に合わせ、
    // 幅 8.5" / 高さ 12.75" のページに 1080px をぴったり収める
    const pdfData = await page.pdf({
      width: '8.5in',
      height: '11in',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 0.7556
    });
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    await browser.close();
    browser = null;

    const fileName = `${sku.toUpperCase()}_${quality}.pdf`;

    res.json({
      success: true,
      fileName: fileName,
      pdfBase64: pdfBuffer.toString('base64')
    });
  } catch (err) {
    console.error('Flyer PDF export error:', err.message);
    console.error(err.stack);
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    res.status(500).json({ error: 'PDF export failed: ' + err.message });
  }
});

module.exports = router;
