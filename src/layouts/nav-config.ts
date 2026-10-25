import { BarChart3, BookOpen, Home, BrainCircuit, Building2, ClipboardCheck, CreditCard, Landmark, LayoutDashboard, LifeBuoy, Library, Receipt, ScanLine, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react";
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
  secondaryLink: { href: string; label: string; icon?: LucideIcon };
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
    { href: routes.workspaceBuildings, label: "Công trình", icon: Building2, group: "Huấn luyện" },
    { href: routes.workspaceLibrary, label: "Thư viện mẫu", icon: Library, group: "Huấn luyện" },
    { href: routes.workspaceAi, label: "Trợ lý AI", icon: Sparkles, group: "Huấn luyện" },
    { href: routes.workspaceAnalytics, label: "Báo cáo", icon: BarChart3, group: "Theo dõi" },
    { href: routes.workspaceBilling, label: "Dịch vụ & thanh toán", icon: Receipt, group: "Quản lý" },
    { href: routes.workspaceSupport, label: "Hỗ trợ & phản hồi", icon: LifeBuoy, group: "Quản lý" },
    { href: routes.workspaceProfile, label: "Hồ sơ tổ chức", icon: UserRound, group: "Quản lý" },
    { href: routes.workspaceIfc, label: "Quét mô hình IFC", icon: ScanLine, group: "Công cụ" },
  ],
  secondaryLink: { href: routes.learn, label: "Khám phá bài học", icon: BookOpen },
};

export const adminArea: OperationsArea = {
  id: "admin",
  label: "Quản trị hệ thống",
  brandSubtitle: "Quản trị hệ thống",
  navLabel: "Quản trị hệ thống",
  allowedRoles: [0],
  signInPrompt: "Đăng nhập bằng tài khoản quản trị FET3D để vào khu quản trị.",
  deniedMessage: "Chỉ quản trị FET3D được vào khu quản trị.",
  deniedHref: routes.home,
  deniedLabel: "Về trang chủ",
  nav: [
    { href: routes.adminOverview, label: "Tổng quan", icon: LayoutDashboard, group: "Xử lý công việc" },
    { href: routes.adminReviews, label: "Duyệt kịch bản", icon: ClipboardCheck, group: "Xử lý công việc" },
    { href: routes.adminSupport, label: "Hỗ trợ & nhật ký", icon: LifeBuoy, group: "Xử lý công việc" },
    { href: routes.adminAccounts, label: "Tài khoản", icon: Users, group: "Quản lý hệ thống" },
    { href: routes.adminOrganizations, label: "Tổ chức", icon: Landmark, group: "Quản lý hệ thống" },
    { href: routes.adminLearn, label: "Bài học", icon: BookOpen, group: "Quản lý nội dung" },
    { href: routes.adminLibrary, label: "Thư viện mẫu", icon: Library, group: "Quản lý nội dung" },
    { href: routes.adminAi, label: "AI & nguồn tri thức", icon: BrainCircuit, group: "Quản lý nội dung" },
    { href: routes.adminCommerce, label: "Dịch vụ & thanh toán", icon: CreditCard, group: "Thương mại" },
  ],
  secondaryLink: { href: routes.home, label: "Về trang chủ", icon: Home },
};
