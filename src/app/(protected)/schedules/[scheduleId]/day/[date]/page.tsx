import { redirect } from 'next/navigation';

export default async function ScheduleDayRoute({
  params,
}: {
  params: Promise<{ scheduleId: string; date: string }>;
}) {
  const { scheduleId, date } = await params;
  redirect(`/schedules/${scheduleId}?tab=timeline&date=${date}`);
}
