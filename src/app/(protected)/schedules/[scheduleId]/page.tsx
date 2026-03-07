import { ScheduleEditor } from '@/features/schedules/schedule-editor';

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  return <ScheduleEditor scheduleId={scheduleId} />;
}
