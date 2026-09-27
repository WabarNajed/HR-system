import { redirect } from 'next/navigation';

/** `/` → the dashboard (signed-out users are sent to /login by the proxy). */
export default function RootPage() {
  redirect('/dashboard');
}
