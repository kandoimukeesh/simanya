/* ============================================================
   settings.js — the Settings screen: business info, billing
   rules, the Loyalty Programme setup, and security.
   ============================================================ */

SCREENS.settings = async (view) => {
  setTitle('Settings');
  removeFab();
  const s = SETTINGS;
  view.innerHTML = `
    <div class="section-title">Business</div>
    <label>Business name</label><input id="businessName" value="${esc(s.businessName)}" />
    <label>Currency symbol</label><input id="currencySymbol" value="${esc(s.currencySymbol)}" style="max-width:80px" />

    <div class="section-title">Billing rules</div>
    <label>Default markup over cost (%) — used to suggest a Selling Price for a new SKU</label>
    <input id="markupPercent" type="number" value="${s.markupPercent}" />
    <label>Default wholesale markup over cost (%) — used to suggest a Wholesale Price for a new SKU</label>
    <input id="wholesaleMarkupPercent" type="number" value="${s.wholesaleMarkupPercent}" />
    <label>Vendor credit period (days before a bill counts as overdue)</label>
    <input id="vendorCreditDays" type="number" value="${s.vendorCreditDays}" />
    <label>Ageing warning threshold (days)</label>
    <input id="agingWarnDays" type="number" value="${s.agingWarnDays}" />
    <label>Ageing critical threshold (days)</label>
    <input id="agingCriticalDays" type="number" value="${s.agingCriticalDays}" />

    <div class="section-title">Loyalty programme</div>
    <p class="helptext">Every customer bill earns points automatically. Points can later be redeemed as a discount on a future bill, capped at a percentage of that bill so redemption never wipes out a sale.</p>
    <label>Applies to which billing type(s)?</label>
    <div class="btn-row">
      <label class="row" style="gap:6px;font-weight:400"><input type="checkbox" id="loyTrading" style="width:auto" ${s.loyaltyEligibleSaleTypes.includes('trading') ? 'checked' : ''} /> Trading</label>
      <label class="row" style="gap:6px;font-weight:400"><input type="checkbox" id="loyTailoring" style="width:auto" ${s.loyaltyEligibleSaleTypes.includes('tailoring') ? 'checked' : ''} /> Tailoring</label>
    </div>
    <p class="helptext">Unticked billing types neither earn nor redeem Loyalty points. Tailoring is excluded by default.</p>
    <label>Points earned — % of bill amount</label>
    <input id="loyaltyAccrualPercent" type="number" min="0" step="0.1" value="${s.loyaltyAccrualPercent}" />
    <label>Redemption value — ₹ per point</label>
    <input id="loyaltyRedemptionValue" type="number" min="0" step="0.01" value="${s.loyaltyRedemptionValue}" />
    <label>Max % of a bill payable using points</label>
    <input id="loyaltyRedemptionCapPercent" type="number" min="0" max="100" value="${s.loyaltyRedemptionCapPercent}" />
    <p class="helptext">Example: at 10%, a customer with 500 points (worth ₹500) billing ₹2,500 can redeem at most ₹250 worth — 250 points — on that one bill, even though they have more.</p>

    <div class="section-title">Security</div>
    <label>App PIN lock (leave blank to disable)</label>
    <input id="pinLock" inputmode="numeric" maxlength="6" value="${esc(s.pinLock)}" placeholder="e.g. 1234" />

    <button class="btn" id="saveSettings" style="margin-top:18px">Save settings</button>
  `;

  $('#saveSettings').onclick = async () => {
    await saveSettings({
      businessName: $('#businessName').value.trim() || 'My Apparel Store',
      currencySymbol: $('#currencySymbol').value || '₹',
      markupPercent: parseFloat($('#markupPercent').value) || 0,
      wholesaleMarkupPercent: parseFloat($('#wholesaleMarkupPercent').value) || 0,
      vendorCreditDays: parseInt($('#vendorCreditDays').value, 10) || 30,
      agingWarnDays: parseInt($('#agingWarnDays').value, 10) || 60,
      agingCriticalDays: parseInt($('#agingCriticalDays').value, 10) || 90,
      loyaltyEligibleSaleTypes: [
        ...($('#loyTrading').checked ? ['trading'] : []),
        ...($('#loyTailoring').checked ? ['tailoring'] : [])
      ],
      loyaltyAccrualPercent: Math.max(0, parseFloat($('#loyaltyAccrualPercent').value) || 0),
      loyaltyRedemptionValue: Math.max(0, parseFloat($('#loyaltyRedemptionValue').value) || 0),
      loyaltyRedemptionCapPercent: Math.min(100, Math.max(0, parseFloat($('#loyaltyRedemptionCapPercent').value) || 0)),
      pinLock: $('#pinLock').value.trim()
    });
    toast('Settings saved');
    Nav.setRoot('home');
  };
};
