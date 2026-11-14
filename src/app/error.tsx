"use client";

import { RouteError } from "@/features/errors/route-error";

export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} />;
}
