/* ============================================================
   pdf.js — builds a downloadable/shareable PDF for a customer
   invoice or a credit note, using the jsPDF library vendored at
   lib/jspdf.umd.min.js (so this works fully offline, once installed).
   The actual "download it / send it on WhatsApp" action re-uses
   core.js's shareOrDownloadFile — the same native-share pattern
   backup.js uses for exports.
   ============================================================ */

async function loadLogoDataUrl() {
  try {
    // The 192px icon is plenty for a ~46pt header logo and keeps the generated
    // PDF small (jsPDF embeds PNGs close to raw pixel size, not re-compressed).
    const res = await fetch('icons/icon-192.png');
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null; // no logo available (e.g. first run before an install) — PDF still works, just without it
  }
}

// Draws the shared header (logo + business name + document title + a rule) and
// returns the y-coordinate to continue drawing from.
async function drawPdfHeader(doc, pageWidth, title) {
  const logo = await loadLogoDataUrl();
  let y = 40;
  if (logo) {
    try { doc.addImage(logo, 'PNG', 40, y - 10, 46, 46); } catch (err) { /* unsupported image data — skip silently */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(SETTINGS.businessName || 'My Apparel Store', logo ? 96 : 40, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(title, logo ? 96 : 40, y + 28);
  doc.setTextColor(0);
  y += 56;
  doc.setDrawColor(200);
  doc.line(40, y, pageWidth - 40, y);
  return y + 24;
}

function pdfRow(doc, y, cols) {
  // cols: [{ text, x, align }]
  cols.forEach(c => doc.text(String(c.text ?? ''), c.x, y, { align: c.align || 'left' }));
}

/* ---------- Customer invoice ---------- */
async function buildInvoicePdf(ci, customer) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 40;
  let y = await drawPdfHeader(doc, pageWidth, `Invoice ${ci.billNumber}`);

  doc.setFontSize(10);
  doc.text(`Date: ${fmtDate(ci.date)}`, rightX, 64, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', 40, y);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(customer?.name || 'Customer', 40, y); y += 14;
  if (customer?.phone) { doc.text(customer.phone, 40, y); y += 14; }
  if (customer?.address) { doc.text(customer.address, 40, y, { maxWidth: 260 }); y += 14; }
  y += 14;

  // Line-items table header
  doc.setFont('helvetica', 'bold');
  pdfRow(doc, y, [
    { text: 'SKU', x: 40 }, { text: 'Description', x: 110 },
    { text: 'Qty', x: rightX - 150, align: 'right' },
    { text: 'Rate', x: rightX - 80, align: 'right' },
    { text: 'Amount', x: rightX, align: 'right' }
  ]);
  y += 8;
  doc.setDrawColor(220);
  doc.line(40, y, rightX, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  for (const l of ci.lines) {
    if (y > 740) { doc.addPage(); y = 50; }
    const rate = l.qty ? round2(l.sellAmount / l.qty) : l.sellAmount;
    pdfRow(doc, y, [
      { text: l.sku || '—', x: 40 },
      { text: l.description || '', x: 110 },
      { text: l.qty, x: rightX - 150, align: 'right' },
      { text: fmtMoney(rate), x: rightX - 80, align: 'right' },
      { text: fmtMoney(l.sellAmount), x: rightX, align: 'right' }
    ]);
    y += 18;
  }
  y += 8;
  doc.setDrawColor(220);
  doc.line(40, y, rightX, y);
  y += 20;

  const returnsCredit = customerInvoiceReturnsCredit(ci);
  const adjTotal = customerInvoiceAdjustmentTotal(ci);
  const net = customerInvoiceNet(ci);
  const bal = customerInvoiceBalance(ci);

  function totalsRow(label, value, { bold = false } = {}) {
    if (bold) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal');
    pdfRow(doc, y, [{ text: label, x: rightX - 200, align: 'right' }, { text: value, x: rightX, align: 'right' }]);
    y += 18;
  }
  totalsRow('Subtotal', fmtMoney(ci.subtotal));
  totalsRow('Final amount', fmtMoney(ci.finalAmount), { bold: true });
  if (returnsCredit) totalsRow('Returns credit', `-${fmtMoney(returnsCredit)}`);
  if (adjTotal) totalsRow('Discount / credit notes applied', `-${fmtMoney(adjTotal)}`);
  totalsRow('Paid', fmtMoney(ci.amountPaid || 0));
  totalsRow(net < 0 ? 'Refund due' : 'Balance due', fmtMoney(Math.abs(net)), { bold: true });

  if (ci.loyaltyPointsEarned || ci.loyaltyPointsRedeemed) {
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    if (ci.loyaltyPointsRedeemed) { doc.text(`Loyalty points redeemed on this bill: ${ci.loyaltyPointsRedeemed}`, 40, y); y += 14; }
    if (ci.loyaltyPointsEarned) { doc.text(`Loyalty points earned on this bill: ${ci.loyaltyPointsEarned}`, 40, y); y += 14; }
    doc.setTextColor(0);
  }
  if ((ci.creditNotesApplied || []).length) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Credit note(s) applied: ${ci.creditNotesApplied.map(c => `${c.cnNumber} (${fmtMoney(c.amountApplied)})`).join(', ')}`, 40, y, { maxWidth: rightX - 40 });
    y += 14;
    doc.setTextColor(0);
  }

  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text('Thank you for your business!', 40, 800);

  return { blob: doc.output('blob'), filename: `${ci.billNumber}.pdf` };
}

/* ---------- Credit note ---------- */
async function buildCreditNotePdf(creditNote, ci, customer) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 40;
  let y = await drawPdfHeader(doc, pageWidth, `Credit Note ${creditNote.cnNumber}`);

  doc.setFontSize(10);
  doc.text(`Date: ${fmtDate(creditNote.date)}`, rightX, 64, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('Issued to', 40, y);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(customer?.name || 'Customer', 40, y); y += 14;
  if (customer?.phone) { doc.text(customer.phone, 40, y); y += 14; }
  y += 10;
  doc.text(`Against original invoice: ${creditNote.billNumber}`, 40, y); y += 14;
  doc.text(`Condition: ${creditNote.condition === 'resellable' ? 'Resellable (restocked)' : 'Damaged (written off)'}`, 40, y); y += 14;
  if (creditNote.note) { doc.text(`Note: ${creditNote.note}`, 40, y, { maxWidth: rightX - 40 }); y += 14; }
  y += 14;

  function totalsRow(label, value, { bold = false } = {}) {
    if (bold) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal');
    pdfRow(doc, y, [{ text: label, x: rightX - 220, align: 'right' }, { text: value, x: rightX, align: 'right' }]);
    y += 18;
  }
  totalsRow('Credit note value', fmtMoney(creditNote.amount), { bold: true });
  const used = round2(creditNote.amount - creditNote.balanceRemaining);
  if (used) totalsRow('Already applied', fmtMoney(used));
  totalsRow('Balance available', fmtMoney(creditNote.balanceRemaining), { bold: true });
  if (creditNote.pointsClawedBack) totalsRow('Loyalty points adjusted', `-${creditNote.pointsClawedBack}`);

  if ((creditNote.applications || []).length) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Applied against', 40, y); y += 16;
    doc.setFont('helvetica', 'normal');
    for (const a of creditNote.applications) {
      pdfRow(doc, y, [
        { text: `${fmtDate(a.date)} · ${a.billNumber}`, x: 40 },
        { text: fmtMoney(a.amountApplied), x: rightX, align: 'right' }
      ]);
      y += 16;
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text('This credit note can be applied toward any future bill, in full or in part.', 40, 800);

  return { blob: doc.output('blob'), filename: `${creditNote.cnNumber}.pdf` };
}

// Shared "download or WhatsApp/share it" action for either PDF kind.
async function sharePdf(blob, filename, shareTitle) {
  return shareOrDownloadFile(blob, filename, { title: shareTitle, text: shareTitle });
}
