import { ArrowDown } from "lucide-react";
import { LandingExperience } from "./landing-experience";
import styles from "./landing.module.css";

const beats = [
  { label: "01 / Làm quen không gian", title: "Biết mình đang ở đâu.", body: "Một hành lang. Một cánh cửa. Một lối đi quen. Làm quen với công trình trước khi cần đưa ra quyết định." },
  { label: "02 / Thử quyết định", title: "Tập một lần. Hiểu thêm một chút.", body: "Quan sát và lựa chọn trong không gian mô phỏng. Mỗi lượt tập là cơ hội thử lại, không phải một bài kiểm tra thuộc lòng." },
  { label: "03 / Xem lại kết quả", title: "Nhìn lại để chủ động hơn.", body: "Xem lại đường đi và những lựa chọn của mình. Hiểu điều đã xảy ra, rồi chuẩn bị tốt hơn cho lần tiếp theo." },
];

export function LandingContent() {
  const panels = [
    <div key="intro" className={styles.intro}>
      <p className={styles.eyebrow}>FIRE3D / KHÔNG GIAN ĐỂ TẬP DƯỢT</p>
      <h1>Làm quen hôm nay.<br /><em>Chủ động ngày mai.</em></h1>
      <p>Một lần bước vào không gian mô phỏng.<br />Thêm một bước chuẩn bị cho thực tế.</p>
      <span className={styles.scrollHint}><ArrowDown size={17} /> Cuộn để bước vào</span>
    </div>,
    ...beats.map(beat => <div key={beat.label} className={styles.beat}><p className={styles.eyebrow}>{beat.label}</p><h2>{beat.title}</h2><p>{beat.body}</p></div>),
  ];
  return <LandingExperience panels={panels} />;
}
