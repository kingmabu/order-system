const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const { Readable } = require('stream');

// SKU頭文字 → カテゴリフォルダ名
function getCategoryFolderName(sku) {
  const prefix = (sku || '').charAt(0).toUpperCase();
  switch (prefix) {
    case 'B': return 'Beef';
    case 'C': return 'Chicken';
    case 'P': return 'Pork';
    case 'S':
    case 'X': return 'Seafood & Others';
    default: return null;
  }
}

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

async function findFolderByName(drive, parentId, name) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return (res.data.files && res.data.files[0]) || null;
}

// 親フォルダ内で「SKUで始まる」サブフォルダを検索（startsWith）
async function findSkuFolder(drive, parentId, sku) {
  const skuUpper = sku.toUpperCase();
  const escaped = skuUpper.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name contains '${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  const match = (res.data.files || []).find(f => f.name.toUpperCase().startsWith(skuUpper));
  return match || null;
}

async function createFolder(drive, parentId, name) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id, name',
    supportsAllDrives: true
  });
  return res.data;
}

async function findFileByName(drive, folderId, fileName) {
  const escaped = fileName.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  return (res.data.files && res.data.files[0]) || null;
}

async function uploadPdf(drive, folderId, fileName, pdfBuffer) {
  const existing = await findFileByName(drive, folderId, fileName);
  const media = {
    mimeType: 'application/pdf',
    body: Readable.from(pdfBuffer)
  };
  if (existing) {
    const res = await drive.files.update({
      fileId: existing.id,
      media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });
    return res.data;
  }
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true
  });
  return res.data;
}

router.post('/export-pdf', async (req, res) => {
  let browser = null;
  try {
    const { sku, quality, flyerHtml, driveParentFolderId } = req.body;

    if (!sku || !quality || !flyerHtml || !driveParentFolderId) {
      return res.status(400).json({ error: 'Missing required fields: sku, quality, flyerHtml, driveParentFolderId' });
    }
    if (quality !== 'print' && quality !== 'email') {
      return res.status(400).json({ error: 'quality must be "print" or "email"' });
    }

    const categoryName = getCategoryFolderName(sku);
    if (!categoryName) {
      return res.status(400).json({ error: `Unknown SKU prefix: ${sku.charAt(0)}` });
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

    const pdfData = await page.pdf({
      width: '8.5in',
      height: '11in',
      printBackground: true,
      scale: 0.75
    });
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    await browser.close();
    browser = null;

    const auth = getDriveAuth();
    const drive = google.drive({ version: 'v3', auth });

    let categoryFolder = await findFolderByName(drive, driveParentFolderId, categoryName);
    if (!categoryFolder) {
      categoryFolder = await createFolder(drive, driveParentFolderId, categoryName);
    }

    let skuFolder = await findSkuFolder(drive, categoryFolder.id, sku);
    if (!skuFolder) {
      skuFolder = await createFolder(drive, categoryFolder.id, sku.toUpperCase());
    }

    const fileName = `${sku.toUpperCase()}_${quality}.pdf`;
    const uploaded = await uploadPdf(drive, skuFolder.id, fileName, pdfBuffer);

    res.json({
      success: true,
      fileUrl: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      fileName: uploaded.name,
      fileId: uploaded.id
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
