"use client";

import { ChartCard, legendOf } from "@/components/charts/chart-card";
import { colorAt, seriesColor, shortDate, type Series } from "@/components/charts/chart-config";
import { AreaChart } from "@/components/charts/lazy";
import { compactMoney, fmt, formatMoney } from "../format";
import type { RevenueReport } from "../types";
import { EmptyReport, KpiTile, Num, ReportTable } from "./charts";
import styles from "./analytics.module.css";

const purposeLabels: Record<string, string> = { Unknown: "Không rõ mục đích" };

/**
 * Money actually received (Applied payment transactions by receipt time), per currency (Figma "Doanh thu 30 ngày").
 * Currencies are never added together: each has its own tile and its own daily chart. Quotation totals are not revenue.
 */
export function RevenueReportView({ data }: { data: RevenueReport }) {
  const currencies = data.totals.map((total) => total.currency);
  return <div className={styles.report}>
    <p className={styles.note}>
      Chỉ tính <strong>tiền đã nhận</strong> (giao dịch thanh toán đã áp dụng, theo thời điểm nhận). <strong>Không tính</strong> tổng báo giá. Mỗi loại tiền tệ được báo riêng, không cộng chung.
    </p>

    {!currencies.length ? <EmptyReport title="Chưa có khoản thu nào trong khoảng thời gian này">Đây là kết quả hợp lệ, không phải lỗi. Thử mở rộng khoảng thời gian (tối đa 90 ngày). Thanh toán chưa được áp dụng hoặc bị từ chối không được tính.</EmptyReport> : <>
      <div className={styles.kpis} data-count={Math.min(4, data.totals.length + 1)} role="group" aria-label="Chỉ số doanh thu">
        {data.totals.map((total) => {
          const days = data.byDay.filter((day) => day.currency === total.currency).sort((a, b) => a.date.localeCompare(b.date));
          return <KpiTile key={total.currency} label={`Đã nhận (${total.currency})`} value={formatMoney(total.amount, total.currency)} hint={`${fmt(total.transactions)} giao dịch`} spark={days.map((day) => day.amount)} sparkColor={seriesColor.revenue} data-testid={`kpi-revenue-${total.currency}`} />;
        })}
        <KpiTile label="Tổ chức đã thanh toán" value={data.payingOrganizations} hint="Số tổ chức khác nhau có giao dịch trong kỳ" data-testid="kpi-paying" />
      </div>

      <div className={styles.lead}>
        {currencies.map((currency) => {
          const days = data.byDay.filter((day) => day.currency === currency).sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({ date: day.date, amount: day.amount, transactions: day.transactions }));
          const series: Series[] = [{ key: "amount", label: `Đã nhận (${currency})`, color: seriesColor.revenue }];
          return <ChartCard key={currency} title={`Theo ngày (${currency})`} description="Ngày theo giờ quốc tế · chỉ những ngày có phát sinh" legend={legendOf(series, colorAt)} height={190} empty={days.length === 0} emptyText={`Không có khoản thu theo ngày bằng ${currency}`} data-testid={`chart-revenue-${currency}`}
            footer={days.length > 0 && <>{fmt(days.length)} ngày có phát sinh · cao nhất trong ngày <strong>{formatMoney(Math.max(...days.map((day) => day.amount)), currency)}</strong></>}
            table={<ReportTable caption={`Doanh thu theo ngày (${currency})`}>
              <thead><tr><th>Ngày</th><Num header>Đã nhận</Num><Num header>Giao dịch</Num></tr></thead>
              <tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><Num>{formatMoney(day.amount, currency)}</Num><Num>{fmt(day.transactions)}</Num></tr>)}</tbody>
            </ReportTable>}>
            <AreaChart data={days} xKey="date" series={series} height={190} formatX={shortDate} formatY={(value) => compactMoney(value, currency)} />
          </ChartCard>;
        })}

        <ChartCard title="Theo mục đích thanh toán" description="Mục đích lấy từ báo giá của thanh toán" height={120} empty={data.byPurpose.length === 0} emptyText="Chưa có khoản thu theo mục đích" data-testid="chart-purposes">
          <ReportTable caption="Doanh thu theo mục đích">
            <thead><tr><th>Mục đích</th><th>Tiền tệ</th><Num header>Đã nhận</Num><Num header>Giao dịch</Num></tr></thead>
            <tbody>{data.byPurpose.map((row) => <tr key={`${row.purpose}-${row.currency}`}><td>{purposeLabels[row.purpose] ?? row.purpose}</td><td>{row.currency}</td><Num>{formatMoney(row.amount, row.currency)}</Num><Num>{fmt(row.transactions)}</Num></tr>)}</tbody>
          </ReportTable>
        </ChartCard>
      </div>
    </>}
  </div>;
}
