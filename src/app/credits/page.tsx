import type { Metadata } from "next";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import styles from "./credits.module.css";

export const metadata: Metadata = {
  title: "Nguồn tài nguyên và giấy phép",
  description: "Tác giả và giấy phép của mô hình 3D, âm thanh, hình ảnh và phông chữ dùng trong website và ứng dụng FET3D.",
};

const UPDATED = "16/11/2026";

type Credit = { work: string; author: string; href: string; usedFor: string };

/** CC BY 4.0 requires naming the author, the licence and a link. Source of truth: Unity/Assets/_Fire3D/Art/Equipment/CREDITS.md. */
const CC_BY: Credit[] = [
  { work: "Firebell & MCP", author: "yvesjotres", href: "https://sketchfab.com/3d-models/477c51d6c7ea4a3a9fff737795f4979d", usedFor: "Nút báo cháy và chuông báo cháy" },
  { work: "Simple smoke detector", author: "sousinho", href: "https://sketchfab.com/3d-models/8db756d4c1564f3197f2415ec2ef7fec", usedFor: "Đầu báo khói" },
  { work: "Fire alarm system Sprinkler", author: "tasha.kosaykina", href: "https://sketchfab.com/3d-models/9416e1a971524b1a89b89cfcf7c2d33f", usedFor: "Đầu phun chữa cháy" },
  { work: "Backpack - Low Poly PBR [1 of 2]", author: "retro.spec", href: "https://sketchfab.com/3d-models/0b795895343b44b69191ef9b55b35840", usedFor: "Ba lô (đồ đạc cá nhân)" },
  { work: "Neo Smartphone", author: "beinaja", href: "https://sketchfab.com/3d-models/766be11ed35347febaecdce40bc9e067", usedFor: "Điện thoại (đồ đạc, gọi 114)" },
  { work: "Padlock", author: "wagnerlima07", href: "https://sketchfab.com/3d-models/padlock-15da0ec38ef54a6ea9a62e444d1077b9", usedFor: "Ổ khóa trên cửa thoát hiểm bị khóa" },
];

const CC_BY_LICENCE = "https://creativecommons.org/licenses/by/4.0/";

/** Public page listing asset authors and licences; linked from the site footer. Plain HTML, no sign-in. */
export default function CreditsPage() {
  return <div className="site-shell">
    <SiteHeader />
    <main className="page-main">
      <article className={styles.doc}>
        <p className="kicker"><span className="kicker-line" /> Pháp lý</p>
        <h1>Nguồn tài nguyên và giấy phép</h1>
        <p className={styles.meta}>Áp dụng cho website fet3d.io.vn và ứng dụng Android FET3D · Cập nhật {UPDATED}</p>

        <p>FET3D là đồ án tốt nghiệp, dùng cho mục đích học tập, phi thương mại. Trang này ghi tác giả và giấy phép của các mô hình 3D, âm thanh, hình ảnh và phông chữ mà chúng tôi dùng lại từ người khác. Cảm ơn các tác giả đã chia sẻ tác phẩm.</p>

        <h2>1. Mô hình 3D theo giấy phép CC BY 4.0</h2>
        <p>Các mô hình dưới đây dùng trong bài tập 3D trên ứng dụng Android, theo giấy phép <a href={CC_BY_LICENCE} target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 (CC BY 4.0)</a>. Chúng tôi đã thu nhỏ ảnh bề mặt, bỏ bớt chi tiết hoặc tách phần để dùng trên điện thoại.</p>
        <ul>
          {CC_BY.map((c) => <li key={c.href}>
            <strong>“<a href={c.href} target="_blank" rel="noopener noreferrer">{c.work}</a>”</strong> của {c.author}, CC BY 4.0. Dùng cho: {c.usedFor}.
          </li>)}
        </ul>

        <h2>2. Mô hình, ảnh bề mặt và bầu trời dùng tự do (CC0)</h2>
        <p>Không bắt buộc ghi tên, nhưng chúng tôi vẫn ghi nguồn:</p>
        <ul>
          <li><strong><a href="https://polyhaven.com" target="_blank" rel="noopener noreferrer">Poly Haven</a>:</strong> bình chữa cháy, máy tính xách tay, hộp sơ cứu (Ulan Cabanilla), bình gas nhỏ, ảnh bầu trời ngày và đêm.</li>
          <li><strong><a href="https://kenney.nl" target="_blank" rel="noopener noreferrer">Kenney</a>:</strong> bồn rửa, bồn tắm, vòi sen; hiệu ứng vết cháy, bột chữa cháy, giọt nước; tiếng bước chân và tiếng bấm nút.</li>
          <li><strong><a href="https://ambientcg.com" target="_blank" rel="noopener noreferrer">ambientCG</a>:</strong> ảnh bề mặt vải (khăn, ga giường, khăn trải bàn, rèm), sàn và tường trong thư viện vật liệu.</li>
          <li><strong>BlenderKit (CC0):</strong> tủ điện (ALEX SAMUSENKO), áo thun rơi trên sàn (Introspective Mnisi), xe lăn.</li>
          <li><strong><a href="https://quaternius.com" target="_blank" rel="noopener noreferrer">Quaternius</a>, Universal Animation Library 1 và 2:</strong> động tác đứng, đi, chạy, cúi, nhảy, leo và các động tác nhóm tự làm trên khung xương này.</li>
        </ul>

        <h2>3. Tài nguyên theo giấy phép miễn phí bản quyền</h2>
        <ul>
          <li><strong>BlenderKit (Royalty Free):</strong> cửa thang máy (Hung Ming Chan); khói, vụ nổ và luồng khí CO2 được dựng thành ảnh động từ tác phẩm của BleachedBroccoli Medvešek. Chỉ phát hành ảnh đã dựng, không phát hành lại mô hình gốc.</li>
          <li><strong><a href="https://pixabay.com" target="_blank" rel="noopener noreferrer">Pixabay</a> (Pixabay Content License):</strong> tiếng chốt bình chữa cháy, nút báo cháy, đầu phun, cúp điện, chuông thang máy, đầu báo khói, bò trên sàn, xả CO2, vòi nước, van, nổ gas, gọi điện, chăn, túi sơ cứu, cầu dao, cửa khóa, xích, cửa sổ, tiếng điện kêu.</li>
        </ul>

        <h2>4. Âm thanh dùng tự do (CC0)</h2>
        <p>Từ <a href="https://freesound.org" target="_blank" rel="noopener noreferrer">Freesound</a>: msx2plus (chuông báo cháy), Nox_Sound và craigsmith (tiếng lửa), wlabarron (cửa chống cháy), Flem0527 (chạm cửa), Iamgiorgio (bình chữa cháy), Tom_Kaszuba (vòi nước), qubodup (ho), drewsimko và WakuWakuWakuWaku (thở dốc), mzui (tiếng nền phòng), julianmateo_ (tia lửa điện), josecruz98 và JoMungus (mặt nạ phòng độc), unfa (kính vỡ). Từ OpenGameArt: bộ tiếng mở và đóng cửa gỗ của qubodup.</p>
        <p>Mọi âm thanh trong game đều là bản thu thật, không tạo bằng máy.</p>

        <h2>5. Biển báo, phông chữ và biểu tượng</h2>
        <ul>
          <li><strong>Biển báo an toàn:</strong> hình theo chuẩn ISO 7010 (cấm dùng thang máy, bình chữa cháy, nút báo cháy, điểm tập kết) lấy từ Wikimedia Commons, thuộc phạm vi công cộng.</li>
          <li><strong>Phông chữ Be Vietnam Pro:</strong> giấy phép SIL Open Font License 1.1.</li>
          <li><strong>Bộ biểu tượng Iconsax:</strong> dùng trên website theo giấy phép đi kèm bộ biểu tượng.</li>
        </ul>

        <h2>6. Do nhóm FET3D tự làm</h2>
        <p>Nhân vật người chơi và người trong tòa nhà (tạo bằng Tripo, chỉnh trong Blender, gắn khung xương bằng AccuRig), tủ vòi chữa cháy, mặt nạ thoát hiểm, khăn, chăn, chặn cửa, các động tác mở cửa, đá cửa, cầm bình chữa cháy, trùm chăn, chèn khe cửa, và các ảnh, hình minh họa trên website.</p>

        <h2>7. Báo thiếu hoặc sai</h2>
        <p>Nếu bạn là tác giả của một tác phẩm trên và thấy thông tin chưa đúng, hãy gửi qua mục <strong>Hỗ trợ</strong> trên website fet3d.io.vn. Chúng tôi sẽ sửa hoặc gỡ tác phẩm.</p>
      </article>
    </main>
    <SiteFooter />
  </div>;
}
