import { AppLogo } from './AppLogo'
import { hesaplaBeklenenNakit } from '../lib/businessDay'
import { formatCurrency, roundCurrency } from '../lib/format'
import type { AppSettings, BusinessDay, BusinessDayReportSnapshot } from '../types'

interface ZReportPrintViewProps {
  report: BusinessDayReportSnapshot
  day?: BusinessDay | null
  titleLabel?: string
  settings?: AppSettings
  mode?: 'receipt' | 'a4'
}

export function ZReportPrintView({
  report,
  day,
  titleLabel,
  settings,
  mode = 'receipt',
}: ZReportPrintViewProps) {
  const storeName = settings?.storeName || 'LEMOON KAFE'
  const location = settings?.location || 'LEMOON KAFE · SIMAV'
  const taxRate = settings?.taxRate ?? 10

  const openedTimeStr = day
    ? new Date(day.openedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  const closedTimeStr = day?.closedAt
    ? new Date(day.closedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Açık Vardiya'

  const openTableCard =
    day?.status === 'open' ? (report.openTablePaymentsByMethod?.card || 0) : 0

  const cashSummary = hesaplaBeklenenNakit(day ?? null, report)
  const { kirilim } = cashSummary

  const expectedCash = day
    ? day.status === 'closed' && typeof cashSummary.arsivExpectedCash === 'number'
      ? cashSummary.arsivExpectedCash
      : cashSummary.beklenen
    : cashSummary.beklenen

  const cashDiff =
    day && typeof day.countedCash === 'number'
      ? (day.cashDifference ?? roundCurrency(day.countedCash - expectedCash))
      : null

  const expectedZ =
    report.expectedZ ??
    day?.expectedZ ??
    roundCurrency(report.paymentDistribution.card + openTableCard)
  const enteredZ = report.enteredZ ?? day?.enteredZ
  const zDiff =
    typeof enteredZ === 'number'
      ? (report.zDifference ?? day?.zDifference ?? roundCurrency(enteredZ - expectedZ))
      : null
  const openGross = roundCurrency(report.openTablesGrossRevenue || 0)
  const paidRefunds = roundCurrency(report.paidRefundsTotal || 0)
  const openPartial = roundCurrency(report.openTablePaymentsTotal || 0)
  const grossCiro = roundCurrency(report.grossItemsRevenue ?? report.totalRevenue)
  const allDiscount = roundCurrency((report.totalDiscount || 0) + (report.openTablesDiscountTotal || 0))
  const netCiroAfterDisc = Math.max(0, roundCurrency(grossCiro - allDiscount))
  const unexplainedDiff = roundCurrency(
    Math.max(report.unexplainedDifference || 0, cashSummary?.aciklanamayanFark || 0),
  )

  if (mode === 'a4') {
    return (
      <div className="z-report-print z-report-a4 bg-white text-stone-900 p-6 rounded-2xl border border-stone-200 max-w-3xl mx-auto text-xs">
        <div className="z-report-header flex items-center justify-between border-b-2 border-stone-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <AppLogo className="w-12 h-12 object-contain" />
            <div>
              <h2 className="text-lg font-extrabold tracking-wide text-stone-900">{storeName}</h2>
              <p className="text-stone-500 font-semibold">{location}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block px-2.5 py-1 rounded bg-stone-900 text-white font-extrabold text-xs uppercase tracking-wider">
              Z RAPORU / GÜN SONU ÖZETİ
            </div>
            <div className="mt-1 text-stone-600 font-semibold">
              {titleLabel || (day ? `Gün #${day.id.slice(0, 6).toUpperCase()}` : 'Rapor')}
            </div>
          </div>
        </div>

        {day && (
          <div className="z-report-day-info grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200 mb-4">
            <div>
              <span className="text-stone-500 block text-[10px] font-bold uppercase">Açılış</span>
              <strong className="text-stone-800">{openedTimeStr}</strong>
              <span className="block text-[10px] text-stone-500">Kasiyer: {day.openedBy}</span>
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] font-bold uppercase">Kapanış</span>
              <strong className="text-stone-800">{closedTimeStr}</strong>
              {day.closedBy && (
                <span className="block text-[10px] text-stone-500">Kasiyer: {day.closedBy}</span>
              )}
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] font-bold uppercase">Durum</span>
              <strong className="text-stone-800">
                {day.status === 'closed' ? 'Kapalı (Arşiv)' : 'Açık'}
              </strong>
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] font-bold uppercase">Not</span>
              <strong className="text-stone-800 truncate block">
                {day.closeNote || day.note || '—'}
              </strong>
            </div>
          </div>
        )}

        {unexplainedDiff > 0 && (
          <div
            className="mb-4 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 font-bold text-[11px]"
            data-testid="zreport-a4-unexplained-diff"
          >
            Açıklanamayan fark: {formatCurrency(unexplainedDiff)} (Negatif bakiye kırpması tespit edildi — veri tutarsızlığını kontrol edin)
          </div>
        )}

        <div className="z-report-kpi-grid grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-5">
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">GİRİLEN ÜRÜNLER (BRÜT)</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(grossCiro)}
            </strong>
            <span className="text-[9px] text-stone-500 block">
              indirim öncesi, açık dahil
            </span>
          </div>
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">SİPARİŞ SAYISI</span>
            <strong className="text-sm font-extrabold text-stone-900">{report.orderCount}</strong>
          </div>
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TAHSİL EDİLEN (NET)</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.paidTablesTotal ?? report.totalRevenue)}
            </strong>
            {allDiscount > 0 && (
              <span className="text-[9px] text-stone-500 block">
                Net Ciro: {formatCurrency(netCiroAfterDisc)}
              </span>
            )}
          </div>
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TOPLAM KDV (%{taxRate} · KART)</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.totalTax)}
            </strong>
          </div>
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TOPLAM İNDİRİM</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(allDiscount)}
            </strong>
          </div>
          <div className="z-report-kpi-card p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">İPTAL ({report.cancelledCount})</span>
            <strong className="text-sm font-extrabold text-rose-700">
              {formatCurrency(report.cancelledTotal)}
            </strong>
          </div>
        </div>

        <div className="z-report-breakdown-grid grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div className="z-report-card p-3.5 rounded-xl border border-stone-200">
            <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2 border-b border-stone-100 pb-1.5">
              Ödeme Yöntemi Dağılımı
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Kredi Kartı</span>
                <strong>{formatCurrency(report.paymentDistribution.card)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Nakit</span>
                <strong>{formatCurrency(report.paymentDistribution.cash)}</strong>
              </div>
              <div className="flex justify-between">
                <span>IBAN / Havale</span>
                <strong>{formatCurrency(report.paymentDistribution.iban)}</strong>
              </div>
              {openPartial > 0 && (
                <div className="flex justify-between pt-1 border-t border-stone-100 text-amber-800 font-bold">
                  <span>Açık Masa Ara Ödeme</span>
                  <strong>{formatCurrency(openPartial)}</strong>
                </div>
              )}
              {(report.previousDayCarryoverCollection || 0) > 0 && (
                <div
                  className="flex justify-between pt-1 border-t border-stone-100 text-amber-900 font-bold"
                  data-testid="zreport-a4-carryover-collection"
                >
                  <span>Önceki günden devreden tahsilat</span>
                  <strong>{formatCurrency(report.previousDayCarryoverCollection || 0)}</strong>
                </div>
              )}
              {openGross > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Açık Masalar (Brüt)</span>
                  <strong>{formatCurrency(openGross)}</strong>
                </div>
              )}
              {paidRefunds > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Ödeme İadeleri</span>
                  <strong>-{formatCurrency(paidRefunds)}</strong>
                </div>
              )}
            </div>
          </div>

          {day && (
            <div className="z-report-card p-3.5 rounded-xl border border-stone-200">
              <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2 border-b border-stone-100 pb-1.5">
                Kasa Özeti
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Açılış Nakiti</span>
                  <strong>{formatCurrency(kirilim.acilisNakiti)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>+ Kapanan adisyonlar (nakit)</span>
                  <strong>{formatCurrency(kirilim.kapananNakit)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>+ Açık masa ara ödemeleri</span>
                  <strong>{formatCurrency(kirilim.acikMasaNakit)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>− Nakit iadeler</span>
                  <strong>{formatCurrency(kirilim.nakitIadeler)}</strong>
                </div>
                {kirilim.kasaGiris > 0 && (
                  <div className="flex justify-between">
                    <span>+ Kasa giriş</span>
                    <strong>{formatCurrency(kirilim.kasaGiris)}</strong>
                  </div>
                )}
                {kirilim.kasaCikis > 0 && (
                  <div className="flex justify-between">
                    <span>− Kasa çıkış</span>
                    <strong>{formatCurrency(kirilim.kasaCikis)}</strong>
                  </div>
                )}
                <div className="flex justify-between border-t border-stone-100 pt-1">
                  <span className="font-bold">= Beklenen Nakit</span>
                  <strong data-testid="zreport-a4-expected-cash">
                    {formatCurrency(expectedCash)}
                  </strong>
                </div>
                {typeof cashSummary.arsivFarki === 'number' && (
                  <div className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded">
                    Merkezi hesap: {formatCurrency(cashSummary.beklenen)} (arşiv farkı:{' '}
                    {formatCurrency(cashSummary.arsivFarki)})
                  </div>
                )}
                {typeof day.countedCash === 'number' && (
                  <div className="flex justify-between">
                    <span>Sayılan Nakit</span>
                    <strong>{formatCurrency(day.countedCash)}</strong>
                  </div>
                )}
                {cashDiff !== null && (
                  <div className="flex justify-between pt-1 border-t border-stone-100 font-bold">
                    <span>Kasa Farkı</span>
                    <strong
                      className={
                        cashDiff === 0
                          ? 'text-emerald-700'
                          : cashDiff > 0
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }
                    >
                      {cashDiff > 0 ? '+' : ''}
                      {formatCurrency(cashDiff)}{' '}
                      {cashDiff === 0 ? '(Kasa Tam)' : cashDiff > 0 ? '(Fazla)' : '(Eksik)'}
                    </strong>
                  </div>
                )}
                {day.cashDifferenceNote && (
                  <div
                    className="mt-1.5 pt-1.5 border-t border-stone-100 text-[10px] text-stone-700"
                    data-testid="zreport-a4-cash-difference-note"
                  >
                    <span className="font-bold">Kasa Farkı Açıklaması:</span>{' '}
                    {day.cashDifferenceNote}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="z-report-card p-3.5 rounded-xl border border-stone-200 bg-stone-50/50">
            <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2 border-b border-stone-100 pb-1.5">
              POS Z RAPORU ÖZETİ
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Kart Satışları (Toplam)</span>
                <strong>{formatCurrency(report.paymentDistribution.card)}</strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-stone-200 font-bold">
                <span>Beklenen POS Z Raporu</span>
                <strong>{formatCurrency(expectedZ)}</strong>
              </div>
              {typeof enteredZ === 'number' && (
                <>
                  <div className="flex justify-between">
                    <span>Fişteki Z Tutarı</span>
                    <strong>{formatCurrency(enteredZ)}</strong>
                  </div>
                  {zDiff !== null && (
                    <div className="flex justify-between font-bold">
                      <span>POS Z Farkı</span>
                      <span
                        className={
                          zDiff === 0
                            ? 'text-emerald-700'
                            : zDiff > 0
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }
                      >
                        {zDiff > 0 ? '+' : ''}
                        {formatCurrency(zDiff)} {zDiff === 0 ? '(Tam)' : zDiff > 0 ? '(Fazla)' : '(Eksik)'}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="z-report-table-section mb-4">
          <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2">
            Satılan Ürünler ({report.soldProducts.length} kalem)
          </h4>
          {report.soldProducts.length === 0 ? (
            <p className="text-stone-400 py-2">Bu dönemde ürün satışı bulunmuyor.</p>
          ) : (
            <table className="z-report-table w-full text-left border-collapse border border-stone-200">
              <thead className="z-report-thead">
                <tr className="bg-stone-100 text-[10px] uppercase text-stone-600">
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Ürün</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Kategori</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Adet</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Tutar</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Pay</th>
                </tr>
              </thead>
              <tbody className="z-report-tbody divide-y divide-stone-100">
                {report.soldProducts.map((p) => (
                  <tr key={p.productKey}>
                    <td className="py-1.5 px-2.5 font-semibold">{p.name}</td>
                    <td className="py-1.5 px-2.5 text-stone-500">{p.category}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold">{p.quantity}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold">
                      {formatCurrency(p.revenue)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right text-stone-500">%{p.share}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {report.cashMovements && report.cashMovements.length > 0 && (
          <div className="z-report-table-section mb-4" data-testid="zreport-a4-cash-movements">
            <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2">
              Kasa Giriş / Çıkış Hareketleri ({report.cashMovements.length} kayıt)
            </h4>
            <table className="z-report-table w-full text-left border-collapse border border-stone-200">
              <thead className="z-report-thead">
                <tr className="bg-stone-100 text-[10px] uppercase text-stone-600">
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Saat / Tür</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Kategori</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Açıklama</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Personel</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="z-report-tbody divide-y divide-stone-100">
                {report.cashMovements.map((mov) => (
                  <tr key={mov.id} className={mov.cancelled ? 'text-stone-400 line-through' : ''}>
                    <td className="py-1.5 px-2.5 font-semibold">
                      {new Date(mov.createdAt).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {mov.type === 'GIRIS' ? 'Giriş' : 'Çıkış'}
                    </td>
                    <td className="py-1.5 px-2.5">{mov.category}</td>
                    <td className="py-1.5 px-2.5">
                      {mov.description}
                      {mov.cancelled && mov.cancelledReason
                        ? ` [İptal: ${mov.cancelledReason}]`
                        : ''}
                    </td>
                    <td className="py-1.5 px-2.5">{mov.createdBy}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold tabular-nums">
                      {mov.type === 'GIRIS' ? '+' : '−'}
                      {formatCurrency(mov.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="z-report-footer text-center text-[10px] text-stone-400 pt-3 border-t border-stone-200">
          Rapor Oluşturulma Zamanı: {new Date(report.generatedAt).toLocaleString('tr-TR')} ·{' '}
          {storeName}
        </div>
      </div>
    )
  }

  return (
    <div className="receipt-wrap">
      <div className="receipt z-report-print">
        <div className="flex justify-center mb-3">
          <AppLogo className="w-14 h-14 object-contain" alt="LEMOON KAFE Logo" />
        </div>
        <div className="receipt-brand">{storeName}</div>
        <div className="receipt-meta">
          {location}
          <br />
          <strong>Z RAPORU (GÜN SONU)</strong>
          <br />
          {titleLabel && (
            <>
              {titleLabel}
              <br />
            </>
          )}
          {day ? (
            <>
              Açılış: {openedTimeStr} ({day.openedBy})<br />
              Kapanış: {closedTimeStr} {day.closedBy ? `(${day.closedBy})` : ''}
            </>
          ) : (
            <>{new Date(report.generatedAt).toLocaleString('tr-TR')}</>
          )}
        </div>

        <div className="receipt-dash" />
        <div className="receipt-line">
          <span>Sipariş Sayısı</span>
          <span>{report.orderCount} adet</span>
        </div>
        <div className="receipt-line">
          <span>Tahsil Edilen (Net)</span>
          <span>{formatCurrency(report.paidTablesTotal ?? report.totalRevenue)}</span>
        </div>
        {openGross > 0 && (
          <div className="receipt-line">
            <span>Açık Masalar (Brüt)</span>
            <span>{formatCurrency(openGross)}</span>
          </div>
        )}
        {openPartial > 0 && (
          <div className="receipt-line">
            <span>Açık Masa Ara Ödeme</span>
            <span>{formatCurrency(openPartial)}</span>
          </div>
        )}
        {paidRefunds > 0 && (
          <div className="receipt-line">
            <span>Ödeme İadeleri</span>
            <span>-{formatCurrency(paidRefunds)}</span>
          </div>
        )}
        <div className="receipt-line">
          <span>Toplam İndirim</span>
          <span>-{formatCurrency(allDiscount)}</span>
        </div>
        {allDiscount > 0 && (
          <div className="receipt-line">
            <span>Net Ciro (İndirim Sonrası)</span>
            <span>{formatCurrency(netCiroAfterDisc)}</span>
          </div>
        )}
        <div className="receipt-line">
          <span>Toplam KDV (%{taxRate} · Kart)</span>
          <span>{formatCurrency(report.totalTax)}</span>
        </div>
        <div className="receipt-line receipt-total">
          <span>GİRİLEN ÜRÜNLER (BRÜT)</span>
          <span>{formatCurrency(grossCiro)}</span>
        </div>
        {unexplainedDiff > 0 && (
          <div
            className="receipt-line"
            style={{ fontWeight: 800, color: '#9f1239' }}
            data-testid="zreport-receipt-unexplained-diff"
          >
            <span>Açıklanamayan fark</span>
            <span>{formatCurrency(unexplainedDiff)}</span>
          </div>
        )}

        <div className="receipt-dash" />
        <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
          ÖDEME DAĞILIMI
        </div>
        <div className="receipt-line">
          <span>Kart</span>
          <span>{formatCurrency(report.paymentDistribution.card)}</span>
        </div>
        <div className="receipt-line">
          <span>Nakit</span>
          <span>{formatCurrency(report.paymentDistribution.cash)}</span>
        </div>
        <div className="receipt-line">
          <span>IBAN</span>
          <span>{formatCurrency(report.paymentDistribution.iban)}</span>
        </div>
        {(report.previousDayCarryoverCollection || 0) > 0 && (
          <div
            className="receipt-line"
            style={{ fontWeight: 700 }}
            data-testid="zreport-receipt-carryover-collection"
          >
            <span>Önceki günden devreden tahsilat</span>
            <span>{formatCurrency(report.previousDayCarryoverCollection || 0)}</span>
          </div>
        )}

        <div className="receipt-dash" />
        <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
          POS Z RAPORU ÖZETİ
        </div>
        <div className="receipt-line">
          <span>Kart Satışları (Toplam)</span>
          <span>{formatCurrency(report.paymentDistribution.card)}</span>
        </div>
        <div className="receipt-line" style={{ fontWeight: 800 }}>
          <span>Beklenen POS Z Raporu</span>
          <span>{formatCurrency(expectedZ)}</span>
        </div>
        {typeof enteredZ === 'number' && (
          <>
            <div className="receipt-line">
              <span>Fişteki Z Tutarı</span>
              <span>{formatCurrency(enteredZ)}</span>
            </div>
            {zDiff !== null && (
              <div className="receipt-line" style={{ fontWeight: 800 }}>
                <span>Z Farkı ({zDiff === 0 ? 'Tam' : zDiff > 0 ? 'Fazla' : 'Eksik'})</span>
                <span>
                  {zDiff > 0 ? '+' : ''}
                  {formatCurrency(zDiff)}
                </span>
              </div>
            )}
          </>
        )}

        {day && (
          <>
            <div className="receipt-dash" />
            <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
              KASA ÖZETİ
            </div>
            <div className="receipt-line">
              <span>Açılış Nakiti</span>
              <span>{formatCurrency(kirilim.acilisNakiti)}</span>
            </div>
            <div className="receipt-line">
              <span>+ Kapanan adisyonlar</span>
              <span>{formatCurrency(kirilim.kapananNakit)}</span>
            </div>
            <div className="receipt-line">
              <span>+ Açık masa ara ödemeleri</span>
              <span>{formatCurrency(kirilim.acikMasaNakit)}</span>
            </div>
            <div className="receipt-line">
              <span>− Nakit iadeler</span>
              <span>{formatCurrency(kirilim.nakitIadeler)}</span>
            </div>
            {kirilim.kasaGiris > 0 && (
              <div className="receipt-line">
                <span>+ Kasa giriş</span>
                <span>{formatCurrency(kirilim.kasaGiris)}</span>
              </div>
            )}
            {kirilim.kasaCikis > 0 && (
              <div className="receipt-line">
                <span>− Kasa çıkış</span>
                <span>{formatCurrency(kirilim.kasaCikis)}</span>
              </div>
            )}
            <div className="receipt-line" style={{ fontWeight: 800 }}>
              <span>= Beklenen Nakit</span>
              <span data-testid="zreport-receipt-expected-cash">
                {formatCurrency(expectedCash)}
              </span>
            </div>
            {typeof cashSummary.arsivFarki === 'number' && (
              <div className="receipt-line">
                <span>Merkezi Hesap (Fark)</span>
                <span>{formatCurrency(cashSummary.beklenen)}</span>
              </div>
            )}
            {typeof day.countedCash === 'number' && (
              <div className="receipt-line">
                <span>Sayılan Nakit</span>
                <span>{formatCurrency(day.countedCash)}</span>
              </div>
            )}
            {cashDiff !== null && (
              <div className="receipt-line" style={{ fontWeight: 800 }}>
                <span>Fark ({cashDiff === 0 ? 'Kasa Tam' : cashDiff > 0 ? 'Fazla' : 'Eksik'})</span>
                <span>
                  {cashDiff > 0 ? '+' : ''}
                  {formatCurrency(cashDiff)}
                </span>
              </div>
            )}
            {day.cashDifferenceNote && (
              <div
                className="receipt-line"
                style={{ display: 'block', marginTop: '3px', fontSize: '10px' }}
                data-testid="zreport-receipt-cash-difference-note"
              >
                <strong>Kasa Farkı Açıklaması:</strong> {day.cashDifferenceNote}
              </div>
            )}
          </>
        )}

        {report.soldProducts.length > 0 && (
          <>
            <div className="receipt-dash" />
            <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
              SATILAN ÜRÜNLER
            </div>
            {report.soldProducts.map((p) => (
              <div key={p.productKey} className="receipt-line">
                <span>
                  {p.quantity} × {p.name}
                </span>
                <span>{formatCurrency(p.revenue)}</span>
              </div>
            ))}
          </>
        )}

        {report.cashMovements && report.cashMovements.length > 0 && (
          <div data-testid="zreport-receipt-cash-movements">
            <div className="receipt-dash" />
            <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
              KASA HAREKETLERİ
            </div>
            {report.cashMovements.map((mov) => (
              <div key={mov.id} style={{ marginBottom: '3px' }}>
                <div
                  className="receipt-line"
                  style={mov.cancelled ? { textDecoration: 'line-through', opacity: 0.65 } : undefined}
                >
                  <span>
                    {mov.type === 'GIRIS' ? '+' : '−'} {mov.category}: {mov.description}
                  </span>
                  <span>
                    {mov.type === 'GIRIS' ? '+' : '−'}
                    {formatCurrency(mov.amount)}
                  </span>
                </div>
                {mov.cancelled && (
                  <div style={{ fontSize: '9px', color: '#555' }}>
                    İptal{mov.cancelledReason ? `: ${mov.cancelledReason}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {report.cancelledCount > 0 && (
          <>
            <div className="receipt-dash" />
            <div className="receipt-line">
              <span>İptal Edilen ({report.cancelledCount} adet)</span>
              <span>{formatCurrency(report.cancelledTotal)}</span>
            </div>
          </>
        )}

        {(day?.note || day?.closeNote) && (
          <div className="receipt-note">
            {day.note && <div>Açılış Notu: {day.note}</div>}
            {day.closeNote && <div>Kapanış Notu: {day.closeNote}</div>}
          </div>
        )}

        <div className="receipt-thanks">Z RAPORU SONU · MALİ DEĞERİ YOKTUR</div>
      </div>
    </div>
  )
}

