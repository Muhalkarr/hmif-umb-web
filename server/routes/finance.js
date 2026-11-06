/* ==========================================================================
   FINANCE ROUTES — Buku Kas & Ledger Keuangan (Pilar Keuangan)
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const receiptExtension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

function isValidReceiptFile(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xFF && buffer[1] === 0xD8;
  if (mimeType === 'image/png') return buffer.slice(0, 4).toString('hex') === '89504e47';
  if (mimeType === 'application/pdf') return buffer.slice(0, 4).toString() === '%PDF';
  return false;
}

export function registerFinanceRoutes(app, ctx) {
  const { db, requireClearance, auditAdminMutation, receiptUpload, RECEIPT_DIR, multer } = ctx;

  app.get('/api/ledger', requireClearance(3), (_req, res) => {
    res.json(db.getFinancialLedger());
  });

  app.get('/api/ledger/receipts/:id', requireClearance(3), (req, res) => {
    const receipt = db.read().financial_ledger
      .map((t) => t.receipt)
      .find((item) => item?.id === req.params.id);
    if (!receipt || !receiptExtension[receipt.mime_type]) return res.status(404).end();
    const filePath = path.resolve(RECEIPT_DIR, `${receipt.id}${receiptExtension[receipt.mime_type]}`);
    if (!filePath.startsWith(`${RECEIPT_DIR}${path.sep}`) || !fs.existsSync(filePath)) return res.status(404).end();
    res.set({ 'Content-Type': receipt.mime_type, 'Content-Length': String(receipt.size), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(receipt.file_name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(filePath).pipe(res);
  });

  app.post('/api/ledger', requireClearance(3), (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (error) => {
      if (!error) return next();
      res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message });
    });
  }, (req, res) => {
    const { date, type, category, description, amount, division } = req.body || {};
    if (!['INCOME', 'EXPENSE'].includes(type) || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0
      || typeof description !== 'string' || !description.trim() || description.length > 240
      || (category !== undefined && (typeof category !== 'string' || category.length > 80))
      || (division !== undefined && (typeof division !== 'string' || division.length > 80))) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Jenis, nominal bilangan bulat, dan keterangan transaksi valid wajib diisi.' });
    }
    if (type === 'EXPENSE' && !req.file)
      return res.status(400).json({ error: 'Lampirkan bukti belanja untuk setiap transaksi pengeluaran.' });

    let receipt = null;
    let storedReceiptPath = null;
    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      if (!isValidReceiptFile(buffer, req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Isi file tidak sesuai dengan tipe bukti yang dipilih.' });
      }
      const id = randomUUID();
      const storedName = `${id}${receiptExtension[req.file.mimetype]}`;
      storedReceiptPath = path.join(RECEIPT_DIR, storedName);
      receipt = { id, file_name: path.basename(req.file.originalname).replace(/[\r\n"\\]/g, '_').slice(0, 160), mime_type: req.file.mimetype, size: req.file.size, sha256: createHash('sha256').update(buffer).digest('hex'), uploaded_at: new Date().toISOString() };
      try { fs.renameSync(req.file.path, storedReceiptPath); } catch {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Bukti belanja tidak dapat disimpan.' });
      }
    }

    let newTx;
    try {
      newTx = db.addFinancialTransaction({ date, type, category: category || 'Umum', description, amount, division, recorded_by: `${req.user.role_title} (${req.user.name})` }, receipt);
    } catch {
      if (storedReceiptPath && fs.existsSync(storedReceiptPath)) fs.unlinkSync(storedReceiptPath);
      return res.status(500).json({ error: 'Transaksi tidak dapat dibukukan.' });
    }
    auditAdminMutation(req, 'ledger.create', 'financial_transaction', newTx.id, { type: newTx.type, amount: newTx.amount, division: newTx.division });
    res.status(201).json({ message: 'TRANSAKSI BERHASIL DIBUKUKAN KE BUKU KAS PRTS', transaction: newTx });
  });
}