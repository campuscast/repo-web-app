import { ReleaseDetailsPage } from '@/features/releases/release-details-page';

export default async function ReleaseDetailsRoute({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  return <ReleaseDetailsPage releaseId={releaseId} />;
}
