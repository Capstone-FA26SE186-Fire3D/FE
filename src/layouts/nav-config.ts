import { BookOpen, Building2, ClipboardCheck, CreditCard, Landmark, LayoutDashboard, LifeBuoy, Library, ScanLine, UserRound, Users, type LucideIcon } from "lucide-react";
import type { UserRole } from "@/features/auth/types";
import { routes } from "@/configs/routes";

/** `pending-be`: screen exists but the BE endpoint is not available yet (see docs/fet3d-operations-ui-tracker.md). */
export type NavStatus = "pending-be";

export type NavItem = { href: string; label: string; icon: LucideIcon; group?: string; status?: NavStatus };

export type OperationsArea = {
  id: "organization" | "admin";
  label: string;
  brandSubtitle: string;
  navLabel: string;
  /** Roles allowed to open the area. Anyone else sees a denied screen. */
  allowedRoles: UserRole[];
  signInPrompt: string;
  deniedMessage: string;
  deniedHref: string;
  deniedLabel: string;
  nav: NavItem[];
  secondaryLink: { href: string; label: string };
};

export const organizationArea: OperationsArea = {
  id: "organization",
  label: "Không gian tổ chức",
  brandSubtitle: "Không gian tổ chức",
  navLabel: "Quản lý tổ chức",
  allowedRoles: [0, 1],
  signInPrompt: "Đăng nhập để quản lý công trình, mô hình IFC, kịch bản và hồ sơ.",
  deniedMessage: "Khu quản lý này dành cho tài khoản tổ chức.",
  deniedHref: routes.learningHub,
  deniedLabel: "Mở thư viện cá nhân",
  nav: [
    { href: routes.workspaceBuildings, label: "Công trình", icon: Building2 },
    { href: routes.workspaceIfc, label: "Quét mô hình IFC", icon: ScanLine },
    { href: routes.workspaceSupport, label: "Hỗ trợ & phản hồi", icon: LifeBuoy },
    { href: routes.workspaceProfile, label: "Hồ sơ tổ chức", icon: UserRound },
  ],
  secondaryLink: { href: routes.learn, label: "Khám phá Learn" },
};

export const adminArea: OperationsArea = {
  id: "admin",
  label: "Quản trị hệ thống",
  brandSubtitle: "Quản trị hệ thống",
  navLabel: "Quản trị hệ thống",
  allowedRoles: [0],
  signInPrompt: "Đăng nhập bằng tài khoản PlatformAdmin để vào khu quản trị.",
  deniedMessage: "Chỉ PlatformAdmin có thể truy cập khu quản trị.",
  deniedHref: routes.home,
  deniedLabel: "Về trang chủ",
  nav: [
    { href: routes.adminOverview, label: "Tổng quan", icon: LayoutDashboard, group: "Vận hành" },
    { href: routes.adminAccounts, label: "Tài khoản", icon: Users, group: "Vận hành" },
    { href: routes.adminOrganizations, label: "Tổ chức", icon: Landmark, group: "Vận hành" },
    { href: routes.adminReviews, label: "Duyệt kịch bản", icon: ClipboardCheck, group: "Nội dung", status: "pending-be" },
    { href: routes.adminLearn, label: "Learn CMS", icon: BookOpen, group: "Nội dung", status: "pending-be" },
    { href: routes.adminLibrary, label: "Thư viện tổ chức", icon: Library, group: "Nội dung", status: "pending-be" },
    { href: routes.adminCommerce, label: "Thương mại", icon: CreditCard, group: "Kinh doanh" },
    { href: routes.adminSupport, label: "Hỗ trợ & audit", icon: LifeBuoy, group: "Kinh doanh" },
  ],
  secondaryLink: { href: routes.home, label: "Về trang chủ" },
};
