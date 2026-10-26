import { AppLogo } from './AppLogo'
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

  const expectedCash = day
    ? (day.expectedCash ?? roundCurrency(day.openingCash + report.paymentDistribution.cash))
    : report.paymentDistribution.cash

  const cashDiff =
    day && typeof day.countedCash === 'number'
      ? (day.cashDifference ?? roundCurrency(day.countedCash - expectedCash))
      : null

  const cutoffTime =
    day?.posZCutoffTime || report.posZCutoffTime || settings?.posZCutoffTime || '23:57'
  const cardCarryIn = report.cardCarryIn ?? day?.cardCarryIn ?? 0
  const cardBeforeCutoff =
    report.cardBeforeCutoff ?? day?.cardBeforeCutoff ?? report.paymentDistribution.card
  const cardAfterCutoff = report.cardAfterCutoff ?? day?.cardAfterCutoff ?? 0
  const expectedZ =
    report.expectedZ ?? day?.expectedZ ?? roundCurrency(cardCarryIn + cardBeforeCutoff)
  const cardCarryOut = report.cardCarryOut ?? day?.cardCarryOut ?? cardAfterCutoff
  const enteredZ = report.enteredZ ?? day?.enteredZ
  const zDiff =
    typeof enteredZ === 'number'
      ? (report.zDifference ?? day?.zDifference ?? roundCurrency(enteredZ - expectedZ))
      : null

  if (mode === 'a4') {
    return (
      <div className="z-report-print z-report-a4 bg-white text-stone-900 p-6 rounded-2xl border border-stone-200 max-w-3xl mx-auto text-xs">
        <div className="flex items-center justify-between border-b-2 border-stone-800 pb-4 mb-4">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200 mb-4">
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

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-5">
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TOPLAM CİRO</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.totalRevenue)}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">SİPARİŞ SAYISI</span>
            <strong className="text-sm font-extrabold text-stone-900">{report.orderCount}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">ORT. ADİSYON</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.averageBasket)}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TOPLAM KDV</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.totalTax)}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">TOPLAM İNDİRİM</span>
            <strong className="text-sm font-extrabold text-stone-900">
              {formatCurrency(report.totalDiscount)}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold block">İPTAL ({report.cancelledCount})</span>
            <strong className="text-sm font-extrabold text-rose-700">
              {formatCurrency(report.cancelledTotal)}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div className="p-3.5 rounded-xl border border-stone-200">
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
            </div>
          </div>

          {day && (
            <div className="p-3.5 rounded-xl border border-stone-200">
              <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2 border-b border-stone-100 pb-1.5">
                Kasa Özeti
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Açılış Nakiti</span>
                  <strong>{formatCurrency(day.openingCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Beklenen Nakit</span>
                  <strong>{formatCurrency(expectedCash)}</strong>
                </div>
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
                      {cashDiff === 0 ? '(Tam)' : cashDiff > 0 ? '(Fazla)' : '(Eksik)'}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50">
            <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2 border-b border-stone-100 pb-1.5">
              POS Z & Kart Devir ({cutoffTime})
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Önceki Günden Devreden</span>
                <strong>{formatCurrency(cardCarryIn)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Kart Satış (Toplam)</span>
                <strong>{formatCurrency(report.paymentDistribution.card)}</strong>
              </div>
              <div className="flex justify-between text-stone-500 pl-2">
                <span>↳ {cutoffTime} Öncesi (Z Dahil)</span>
                <span className="font-semibold text-stone-700">{formatCurrency(cardBeforeCutoff)}</span>
              </div>
              <div className="flex justify-between text-stone-500 pl-2">
                <span>↳ {cutoffTime} Sonrası (Devreden)</span>
                <span className="font-semibold text-stone-700">{formatCurrency(cardAfterCutoff)}</span>
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
              <div className="flex justify-between pt-1 border-t border-stone-200 text-amber-900 font-bold">
                <span>Yarına Devreden Kart</span>
                <strong>{formatCurrency(cardCarryOut)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h4 className="font-extrabold text-stone-800 uppercase text-[11px] mb-2">
            Satılan Ürünler ({report.soldProducts.length} kalem)
          </h4>
          {report.soldProducts.length === 0 ? (
            <p className="text-stone-400 py-2">Bu dönemde ürün satışı bulunmuyor.</p>
          ) : (
            <table className="w-full text-left border-collapse border border-stone-200">
              <thead>
                <tr className="bg-stone-100 text-[10px] uppercase text-stone-600">
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Ürün</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200">Kategori</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Adet</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Tutar</th>
                  <th className="py-1.5 px-2.5 border-b border-stone-200 text-right">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
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

        <div className="text-center text-[10px] text-stone-400 pt-3 border-t border-stone-200">
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
          <span>Ortalama Adisyon</span>
          <span>{formatCurrency(report.averageBasket)}</span>
        </div>
        <div className="receipt-line">
          <span>Toplam İndirim</span>
          <span>-{formatCurrency(report.totalDiscount)}</span>
        </div>
        <div className="receipt-line">
          <span>Toplam KDV</span>
          <span>{formatCurrency(report.totalTax)}</span>
        </div>
        <div className="receipt-line receipt-total">
          <span>TOPLAM CİRO</span>
          <span>{formatCurrency(report.totalRevenue)}</span>
        </div>

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

        <div className="receipt-dash" />
        <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
          POS Z RAPORU & KART DEVİR ({cutoffTime})
        </div>
        <div className="receipt-line">
          <span>Önceki Günden Devreden</span>
          <span>{formatCurrency(cardCarryIn)}</span>
        </div>
        <div className="receipt-line">
          <span>Kart Satış (Toplam)</span>
          <span>{formatCurrency(report.paymentDistribution.card)}</span>
        </div>
        <div className="receipt-line" style={{ fontSize: '9px', color: '#666' }}>
          <span>  ↳ {cutoffTime} Öncesi (Z Dahil)</span>
          <span>{formatCurrency(cardBeforeCutoff)}</span>
        </div>
        <div className="receipt-line" style={{ fontSize: '9px', color: '#666' }}>
          <span>  ↳ {cutoffTime} Sonrası (Devreden)</span>
          <span>{formatCurrency(cardAfterCutoff)}</span>
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
        <div className="receipt-line" style={{ fontWeight: 800 }}>
          <span>Yarına Devreden Kart</span>
          <span>{formatCurrency(cardCarryOut)}</span>
        </div>

        {day && (
          <>
            <div className="receipt-dash" />
            <div style={{ fontSize: '10px', fontWeight: 800, padding: '6px 0 2px' }}>
              KASA ÖZETİ
            </div>
            <div className="receipt-line">
              <span>Açılış Nakiti</span>
              <span>{formatCurrency(day.openingCash)}</span>
            </div>
            <div className="receipt-line">
              <span>Beklenen Nakit</span>
              <span>{formatCurrency(expectedCash)}</span>
            </div>
            {typeof day.countedCash === 'number' && (
              <div className="receipt-line">
                <span>Sayılan Nakit</span>
                <span>{formatCurrency(day.countedCash)}</span>
              </div>
            )}
            {cashDiff !== null && (
              <div className="receipt-line" style={{ fontWeight: 800 }}>
                <span>Fark ({cashDiff === 0 ? 'Tam' : cashDiff > 0 ? 'Fazla' : 'Eksik'})</span>
                <span>
                  {cashDiff > 0 ? '+' : ''}
                  {formatCurrency(cashDiff)}
                </span>
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

