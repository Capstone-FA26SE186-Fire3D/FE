"use client";

import { Panel, Stat } from "@/components/ui/panel";
import { Table } from "@/components/ui/table";
import { fmt, formatMoney } from "../format";
import type { RevenueReport } from "../types";
import { DataTable, DayColumns, EmptyReport } from "./charts";
import styles from "./analytics.module.css";

const purposeLabels: Record<string, string> = { Unknown: "Không rõ mục đích" };

/**
 * Money actually received (Applied payment transactions by receipt time), per currency. Currencies are never added
 * together: each has its own totals and its own daily chart. Quotation totals are not revenue.
 */
export function RevenueReportView({ data }: { data: RevenueReport }) {
  const currencies = data.totals.map((total) => total.currency);
  return <>
    <p className={styles.note}>
      Chỉ tính <strong>tiền đã nhận</strong> (giao dịch thanh toán đã áp dụng, theo thời điểm nhận). <strong>Không tính</strong> tổng báo giá. Mỗi loại tiền tệ được báo riêng, không cộng chung.
    </p>

    {!currencies.length ? <EmptyReport title="Chưa có khoản thu nào trong khoảng thời gian này">Đây là kết quả hợp lệ, không phải lỗi. Thử mở rộng khoảng thời gian (tối đa 90 ngày). Thanh toán chưa được áp dụng hoặc bị từ chối không được tính.</EmptyReport> : <>
      <div className="ops-grid ops-grid-4" style={{ marginBottom: 16 }}>
        {data.totals.map((total) => <Stat key={total.currency} label={`Đã nhận (${total.currency})`} value={formatMoney(total.amount, total.currency)} hint={`${fmt(total.transactions)} giao dịch`} />)}
        <Stat label="Tổ chức đã thanh toán" value={fmt(data.payingOrganizations)} hint="Số tổ chức khác nhau có giao dịch trong kỳ" />
      </div>

      <div className="ops-grid ops-grid-2">
        {currencies.map((currency) => {
          const days = data.byDay.filter((day) => day.currency === currency).map((day) => ({ date: day.date, amount: day.amount, transactions: day.transactions }));
          return <Panel key={currency} title={`Theo ngày (${currency})`} description="Ngày theo UTC. Cột chỉ để so sánh nhanh; số liệu nằm trong bảng.">
            {days.length ? <>
              <DayColumns days={days} format={(amount) => formatMoney(amount, currency)} label={`Doanh thu theo ngày bằng ${currency}: ${days.length} ngày có phát sinh`} />
              <DataTable caption={`Doanh thu theo ngày (${currency})`}>
                <thead><tr><th>Ngày (UTC)</th><th className={styles.num}>Đã nhận</th><th className={styles.num}>Giao dịch</th></tr></thead>
                <tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><td className={styles.num}>{formatMoney(day.amount, currency)}</td><td className={styles.num}>{fmt(day.transactions)}</td></tr>)}</tbody>
              </DataTable>
            </> : <p className={styles.muted}>Không có khoản thu theo ngày bằng {currency}.</p>}
          </Panel>;
        })}
        <Panel title="Theo mục đích thanh toán" description="Mục đích lấy từ báo giá của thanh toán.">
          {data.byPurpose.length ? <Table caption="Doanh thu theo mục đích">
            <thead><tr><th>Mục đích</th><th>Tiền tệ</th><th className={styles.num}>Đã nhận</th><th className={styles.num}>Giao dịch</th></tr></thead>
            <tbody>{data.byPurpose.map((row) => <tr key={`${row.purpose}-${row.currency}`}><td>{purposeLabels[row.purpose] ?? row.purpose}</td><td>{row.currency}</td><td className={styles.num}>{formatMoney(row.amount, row.currency)}</td><td className={styles.num}>{fmt(row.transactions)}</td></tr>)}</tbody>
          </Table> : <p className={styles.muted}>Chưa có khoản thu theo mục đích.</p>}
        </Panel>
      </div>
    </>}
  </>;
}
