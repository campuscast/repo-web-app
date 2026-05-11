import { ScreenGroupComposer } from '@/features/screen-groups/screen-group-composer';

export default async function ScreenGroupComposePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ zoneId?: string }>;
}) {
  const { groupId } = await params;
  const { zoneId } = await searchParams;

  return <ScreenGroupComposer groupId={groupId} initialZoneId={zoneId} />;
}
