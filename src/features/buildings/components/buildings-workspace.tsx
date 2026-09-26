"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "../api";
import type { BuildingSummary } from "../types";

function errorMessage(): string {
  return "Không thể cập nhật danh sách công trình. Hãy thử lại sau.";
}

export function BuildingsWorkspace() {
  const router = useRouter();
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [name, setName] = useState("");
  const [buildingType, setBuildingType] = useState("");
  const [totalFloors, setTotalFloors] = useState("1");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");
    try {
      const response = await buildingsApi.list(accessToken, { page: 1, pageSize: 50, search: search.trim() || undefined });
      setBuildings(response.items);
    } catch {
      setError(errorMessage());
    } finally {
      setLoading(false);
    }
  }, [accessToken, search]);

  useEffect(() => {
    if (!ready || user?.role === 2 || (user?.role === 0 && !user.organizationId)) return;
    void load();
  }, [load, ready, user?.organizationId, user?.role]);

  const createBuilding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedFloors = Number(totalFloors);
    const normalizedName = name.trim();

    if (!accessToken) return;
    if (!normalizedName || normalizedName.length > 200 || !Number.isInteger(parsedFloors) || parsedFloors < 1) {
      setError("Tên công trình hoặc số tầng chưa hợp lệ.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const created = await buildingsApi.create(accessToken, {
        name: normalizedName,
        buildingType: buildingType.trim() || null,
        totalFloors: parsedFloors,
        location: null,
        contact: null,
      });
      router.push(`${routes.workspaceBuildings}/${created.id}`);
    } catch {
      setError(errorMessage());
    } finally {
      setCreating(false);
    }
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Công trình</h1><p>Hãy đăng nhập để quản lý công trình và mô hình IFC.</p><Button asChild><Link href={`${routes.login}?next=${routes.workspaceBuildings}`}>Đăng nhập</Link></Button></Card>;
  if (user?.role === 2) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Tài khoản học viên không có quyền quản lý công trình.</p></Card>;
  if (user?.role === 0 && !user.organizationId) return <Card className="admin-card"><h1>Công trình theo tổ chức</h1><p>PlatformAdmin hãy tạo tổ chức, cấp tài khoản OrganizationUser, rồi đăng nhập bằng tài khoản đó để tạo công trình.</p><Button asChild variant="secondary"><Link href={routes.adminOrganizations}>Quản lý tổ chức</Link></Button></Card>;

  return <div className="admin-layout">
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Không gian mô hình</p><h1>Công trình</h1><p>Tạo công trình thuộc tổ chức của bạn, sau đó thêm revision IFC để theo dõi trạng thái xử lý.</p></header>
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="admin-grid">
      <Card className="admin-card"><h2>Tạo công trình</h2><form className="admin-form" onSubmit={createBuilding}>
        <label>Tên công trình<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Loại công trình<input maxLength={200} value={buildingType} onChange={(event) => setBuildingType(event.target.value)} placeholder="Chung cư, trường học…" /></label>
        <label>Số tầng<input required min="1" inputMode="numeric" type="number" value={totalFloors} onChange={(event) => setTotalFloors(event.target.value)} /></label>
        <Button type="submit" disabled={creating}>{creating ? "Đang tạo…" : "Tạo và thêm IFC"}</Button>
      </form></Card>
      <Card className="admin-card"><h2>Lưu ý</h2><p>Mỗi công trình chỉ thuộc tổ chức đã gắn trong tài khoản. Bạn không thể chọn hoặc thay đổi tổ chức từ trình duyệt.</p></Card>
    </div>
    <Card className="admin-card"><div className="admin-toolbar"><h2>Danh sách công trình</h2><Button variant="quiet" onClick={() => void load()} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</Button></div>
      <form className="admin-filters workspace-search" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Tìm công trình<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên công trình" /></label><Button type="submit" variant="secondary" disabled={loading}>Tìm</Button></form>
      {loading ? <p role="status">Đang tải danh sách công trình…</p> : <div className="account-table-wrap"><table><thead><tr><th>Công trình</th><th>Loại</th><th>Số tầng</th><th>Trạng thái</th></tr></thead><tbody>
        {buildings.map((building) => <tr key={building.id}><td><Link className="workspace-building-link" href={`${routes.workspaceBuildings}/${building.id}`}>{building.name}</Link></td><td>{building.buildingType || "Chưa phân loại"}</td><td>{building.totalFloors}</td><td>{building.isActive ? "Hoạt động" : "Đã lưu trữ"}</td></tr>)}
        {!buildings.length && <tr><td colSpan={4}>Chưa có công trình phù hợp.</td></tr>}
      </tbody></table></div>}
    </Card>
  </div>;
}
