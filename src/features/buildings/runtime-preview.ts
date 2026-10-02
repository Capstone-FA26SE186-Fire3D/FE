type RuntimePreviewFields = {
  artifactId: string | null;
  downloadUrl: string | null;
  sha256Hash: string | null;
};

export function hasRuntimePreview(preview: RuntimePreviewFields | null): preview is RuntimePreviewFields & {
  artifactId: string;
  downloadUrl: string;
  sha256Hash: string;
} {
  return Boolean(preview?.artifactId && preview.downloadUrl && preview.sha256Hash);
}
