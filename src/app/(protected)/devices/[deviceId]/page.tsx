import { DeviceDetail } from '@/features/devices/device-detail';

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  return <DeviceDetail deviceId={deviceId} />;
}
